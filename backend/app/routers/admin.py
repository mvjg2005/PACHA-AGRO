from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import admin_user
from app.models import Attendance, Community, Meeting, Membership, Notice, Observation, OutboundMessage, RegionalNotice, User
from app.routers.communities import community_out
from app.schemas import RoleIn, UserRoleIn
from app.services.activity import log

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/communities")
def communities(status: str = Query("pending", pattern="^(pending|approved|rejected)$"), admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    out = []
    for c in db.scalars(select(Community).where(Community.status == status)):
        d = community_out(db, c)
        creator = db.get(User, c.created_by)
        d["requested_by"] = creator.full_name if creator else None
        out.append(d)
    return out


@router.post("/communities/{cid}/{decision}")
def decide(cid: int, decision: str, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    if decision not in ("approve", "reject"):
        raise HTTPException(404, "Acción no válida.")
    c = db.get(Community, cid)
    if c is None:
        raise HTTPException(404, "Comunidad no encontrada.")
    if c.status != "pending":
        raise HTTPException(409, "Esta solicitud de comunidad ya fue resuelta.")
    c.status = "approved" if decision == "approve" else "rejected"
    # Aprobar la comunidad aprueba también al solicitante como representante.
    for m in db.scalars(select(Membership).where(Membership.community_id == cid, Membership.user_id == c.created_by)):
        m.status = "approved" if decision == "approve" else "rejected"
        m.reviewed_by = admin.id
    log(db, "comunidad_" + ("aprobada" if decision == "approve" else "rechazada"), c.name, admin.id, cid)
    db.commit()
    return {"id": c.id, "status": c.status}


@router.get("/users")
def users(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    return [{"id": u.id, "full_name": u.full_name, "phone_last4": u.phone[-4:], "role": u.role, "is_demo": u.is_demo,
             "is_active": u.is_active, "whatsapp_opt_in": u.whatsapp_opt_in} for u in db.scalars(select(User).order_by(User.id))]


@router.post("/users/{uid}/role")
def set_user_role(uid: int, body: UserRoleIn, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Asigna el rol global de editor de contenido (o lo quita). Nunca otorga 'admin'."""
    u = db.get(User, uid)
    if u is None or u.role == "admin":
        raise HTTPException(400, "No se puede cambiar el rol de esta cuenta.")
    u.role = body.role
    log(db, "rol_global", f"{u.full_name}: {body.role}", admin.id)
    db.commit()
    return {"id": u.id, "role": u.role}


@router.post("/users/{uid}/reset-password")
def reset_password(uid: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Recuperación de clave sin SMS: el administrador entrega en persona una clave temporal (se muestra una sola vez)."""
    import secrets

    from app.core.security import hash_password

    u = db.get(User, uid)
    if u is None or not u.is_active or u.role == "admin":
        raise HTTPException(400, "No se puede restablecer la clave de esta cuenta.")
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"  # sin letras o números que se confunden (l, 1, o, 0)
    temp = "".join(secrets.choice(alphabet) for _ in range(8))
    u.password_hash = hash_password(temp)
    u.must_change_password = True
    log(db, "clave_restablecida", u.full_name, admin.id)
    db.commit()
    return {"temporary_password": temp, "message": "Entregue esta clave en persona. La persona deberá cambiarla al ingresar."}


@router.get("/messages")
def messages(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Historial de mensajes salientes con su estado (simulado, enviado, entregado, leído, fallido)."""
    rows = db.execute(select(OutboundMessage, User).join(User, User.id == OutboundMessage.user_id)
                      .order_by(OutboundMessage.id.desc()).limit(100)).all()
    return [{"id": m.id, "user_name": u.full_name, "template": m.template, "channel": m.channel, "status": m.status,
             "error": m.error, "created_at": m.created_at.isoformat(timespec="minutes")} for m, u in rows]


@router.post("/users/{uid}/deactivate")
def deactivate(uid: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if u is None or u.id == admin.id:
        raise HTTPException(400, "No se puede desactivar esta cuenta.")
    u.is_active = False
    log(db, "usuario_desactivado", u.full_name, admin.id)
    db.commit()
    return {"id": u.id, "is_active": False}


@router.post("/memberships/{mid}/role")
def set_role(mid: int, body: RoleIn, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    m = db.get(Membership, mid)
    if m is None or m.status != "approved":
        raise HTTPException(404, "Membresía aprobada no encontrada.")
    m.role = body.role
    log(db, "rol_cambiado", f"membresía {mid}: {body.role}", admin.id, m.community_id)
    db.commit()
    return {"id": m.id, "role": m.role}


@router.get("/memberships")
def memberships(community_id: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    rows = db.execute(select(Membership, User).join(User, User.id == Membership.user_id).where(Membership.community_id == community_id)).all()
    return [{"id": m.id, "user_name": u.full_name, "role": m.role, "status": m.status} for m, u in rows]


@router.get("/reports")
def reports(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    count = lambda model, *w: db.scalar(select(func.count(model.id)).where(*w))  # noqa: E731
    return {
        "_nota": "Conteos del sistema del prototipo. Incluye cuentas de demostración.",
        "users": count(User), "users_whatsapp_opt_in": count(User, User.whatsapp_opt_in.is_(True)),
        "communities_approved": count(Community, Community.status == "approved"),
        "communities_pending": count(Community, Community.status == "pending"),
        "meetings": count(Meeting), "attendance_responses": count(Attendance), "notices": count(Notice),
        "observations": count(Observation), "observations_by_kind": dict(db.execute(select(Observation.kind, func.count()).group_by(Observation.kind)).all()),
        "outbound_simulated": count(OutboundMessage, OutboundMessage.status == "simulado"),
        "regional_notices_active": count(RegionalNotice, RegionalNotice.archived.is_(False)),
        "editors": count(User, User.role == "editor"),
    }
