"""Comunidades, membresías, reuniones, avisos, observaciones e historial.

Controles contra suplantación y acceso no autorizado:
  * Las comunidades nuevas quedan 'pendientes' hasta que un administrador las aprueba.
  * El rol de representante lo asigna un administrador (o se aprueba junto con la comunidad).
  * Solo miembros aprobados ven reuniones, avisos y observaciones.
  * Solo representantes publican avisos y crean reuniones; cada publicación muestra autor y rol.
  * Las observaciones de agricultores son 'observaciones comunitarias', nunca alertas oficiales.
"""
from datetime import datetime, timedelta

from app.core.time import local_now, to_local_naive

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.data.catalog import get_municipality
from app.db import get_db
from app.deps import current_user, get_approved_community, membership_of, require_member, require_representative
from app.models import ActivityLog, Attendance, Community, Meeting, Membership, Notice, Observation, OutboundMessage, User, utcnow
from app.schemas import AttendanceIn, CommunityIn, MeetingIn, NoticeIn, ObservationIn, ReviewIn
from app.services.activity import log

router = APIRouter(prefix="/api", tags=["comunidades"])

KIND_LABEL = {"helada": "Helada", "granizo": "Granizo", "lluvia_fuerte": "Lluvia fuerte", "sequia": "Sequía", "otro": "Otro"}


def community_out(db: Session, c: Community, user: User | None = None) -> dict:
    m = get_municipality(c.municipality_id) or {}
    members = db.scalar(select(func.count(Membership.id)).where(Membership.community_id == c.id, Membership.status == "approved"))
    reps = db.scalars(select(User.full_name).join(Membership, Membership.user_id == User.id).where(
        Membership.community_id == c.id, Membership.role == "representative", Membership.status == "approved")).all()
    out = {"id": c.id, "name": c.name, "description": c.description, "status": c.status, "is_demo": c.is_demo,
           "department_id": c.department_id, "department_name": m.get("department_name"),
           "municipality_id": c.municipality_id, "municipality_name": m.get("name"),
           "members": members, "representatives": list(reps)}
    if user:
        mem = membership_of(db, user, c.id)
        out["my_membership"] = {"id": mem.id, "role": mem.role, "status": mem.status} if mem else None
    return out


def meeting_out(db: Session, mt: Meeting, user: User | None) -> dict:
    counts = dict(db.execute(select(Attendance.response, func.count()).where(Attendance.meeting_id == mt.id).group_by(Attendance.response)).all())
    mine = db.scalar(select(Attendance.response).where(Attendance.meeting_id == mt.id, Attendance.user_id == user.id)) if user else None
    author = db.get(User, mt.created_by)
    return {"id": mt.id, "community_id": mt.community_id, "title": mt.title, "description": mt.description, "place": mt.place,
            "starts_at": mt.starts_at.isoformat(timespec="minutes") + "-04:00", "cancelled": mt.cancelled,
            "created_by": author.full_name if author else None,
            "attendance": {"si": counts.get("si", 0), "no": counts.get("no", 0), "tal_vez": counts.get("tal_vez", 0)},
            "my_response": mine}


# ---------- Comunidades ----------

@router.get("/communities")
def list_communities(department_id: str | None = Query(None, max_length=40), municipality_id: str | None = Query(None, max_length=60),
                     db: Session = Depends(get_db)):
    q = select(Community).where(Community.status == "approved")
    if not get_settings().seed_demo:
        q = q.where(Community.is_demo.is_(False))
    if department_id:
        q = q.where(Community.department_id == department_id)
    if municipality_id:
        q = q.where(Community.municipality_id == municipality_id)
    return [community_out(db, c) for c in db.scalars(q.order_by(Community.name))]


@router.post("/communities", status_code=201)
def create_community(body: CommunityIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    m = get_municipality(body.municipality_id)
    if not m:
        raise HTTPException(422, "Municipio no válido.")
    pending = db.scalar(select(func.count(Community.id)).where(Community.created_by == user.id, Community.status == "pending"))
    if pending >= 3 and user.role != "admin":
        raise HTTPException(429, "Ya tiene 3 solicitudes de comunidad pendientes. Espere la revisión.")
    c = Community(name=body.name, municipality_id=m["id"], department_id=m["department_id"], description=body.description,
                  created_by=user.id, status="approved" if user.role == "admin" else "pending")
    db.add(c)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ya existe una comunidad con ese nombre en este municipio.")
    # El creador solicita ser representante; queda pendiente hasta la aprobación del administrador.
    db.add(Membership(user_id=user.id, community_id=c.id, role="representative", status="approved" if user.role == "admin" else "pending"))
    log(db, "comunidad_solicitada", f"{c.name} ({m['name']})", user.id, c.id)
    db.commit()
    return community_out(db, c, user)


@router.get("/me/communities")
def my_communities(user: User = Depends(current_user), db: Session = Depends(get_db)):
    query = select(Community).join(Membership).where(Membership.user_id == user.id)
    if not get_settings().seed_demo:
        query = query.where(Community.is_demo.is_(False))
    rows = db.scalars(query).all()
    return [community_out(db, c, user) for c in rows]


@router.get("/communities/{cid}")
def get_community(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = db.get(Community, cid)
    if c is None:
        raise HTTPException(404, "Comunidad no encontrada.")
    if (c.is_demo and not get_settings().seed_demo) or (
        c.status != "approved" and c.created_by != user.id and user.role != "admin"
    ):
        raise HTTPException(404, "Comunidad no encontrada.")
    return community_out(db, c, user)


@router.post("/communities/{cid}/join", status_code=201)
def join(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_approved_community(db, cid)
    if membership_of(db, user, cid):
        raise HTTPException(409, "Ya envió una solicitud o ya es miembro.")
    db.add(Membership(user_id=user.id, community_id=c.id, role="member", status="pending"))
    log(db, "solicitud_union", user.full_name, user.id, c.id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ya existe una solicitud o ya es miembro.")
    return {"status": "pending", "message": "Solicitud enviada. El representante debe aprobarla."}


@router.get("/communities/{cid}/requests")
def pending_requests(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_approved_community(db, cid)
    require_representative(db, user, cid)
    rows = db.execute(select(Membership, User).join(User, User.id == Membership.user_id).where(
        Membership.community_id == cid, Membership.status == "pending")).all()
    return [{"id": m.id, "user_name": u.full_name, "phone_last4": u.phone[-4:], "role": m.role, "created_at": m.created_at.isoformat(timespec="minutes") + "+00:00"} for m, u in rows]


@router.get("/communities/{cid}/members")
def members(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_approved_community(db, cid)
    require_member(db, user, cid)
    rows = db.execute(select(Membership, User).join(User, User.id == Membership.user_id).where(
        Membership.community_id == cid, Membership.status == "approved")).all()
    return [{"user_name": u.full_name, "role": m.role, "whatsapp": u.whatsapp_opt_in} for m, u in rows]


@router.post("/memberships/{mid}/{decision}")
def decide_membership(mid: int, decision: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if decision not in ("approve", "reject"):
        raise HTTPException(404, "Acción no válida.")
    m = db.get(Membership, mid)
    if m is None:
        raise HTTPException(404, "Solicitud no encontrada.")
    get_approved_community(db, m.community_id)
    if m.role == "representative" and user.role != "admin":
        raise HTTPException(403, "Solo un administrador aprueba representantes.")
    require_representative(db, user, m.community_id)
    if m.user_id == user.id and user.role != "admin":
        raise HTTPException(403, "No puede aprobar su propia solicitud.")
    if m.status != "pending":
        raise HTTPException(409, "La solicitud ya fue revisada.")
    m.status = "approved" if decision == "approve" else "rejected"
    m.reviewed_by = user.id
    target = db.get(User, m.user_id)
    log(db, "miembro_aprobado" if decision == "approve" else "miembro_rechazado", target.full_name, user.id, m.community_id)
    db.commit()
    return {"id": m.id, "status": m.status}


# ---------- Reuniones ----------

@router.get("/communities/{cid}/meetings")
def list_meetings(cid: int, include_past: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_approved_community(db, cid)
    require_member(db, user, cid)
    q = select(Meeting).where(Meeting.community_id == cid)
    if not include_past:
        q = q.where(Meeting.starts_at >= local_now() - timedelta(hours=6))
    return [meeting_out(db, mt, user) for mt in db.scalars(q.order_by(Meeting.starts_at))]


@router.post("/communities/{cid}/meetings", status_code=201)
def create_meeting(cid: int, body: MeetingIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_approved_community(db, cid)
    require_representative(db, user, cid)
    starts = to_local_naive(body.starts_at)
    if starts < local_now() - timedelta(minutes=5):
        raise HTTPException(422, "La fecha de la reunión ya pasó.")
    if starts > local_now() + timedelta(days=365):
        raise HTTPException(422, "La fecha es demasiado lejana.")
    mt = Meeting(community_id=cid, title=body.title, description=body.description, place=body.place, starts_at=starts, created_by=user.id)
    db.add(mt)
    db.flush()
    log(db, "reunion_creada", f"{mt.title} — {starts:%d/%m %H:%M}", user.id, cid)
    db.commit()
    return meeting_out(db, mt, user)


def _meeting_for_member(db, mid, user) -> Meeting:
    mt = db.get(Meeting, mid)
    if mt is None:
        raise HTTPException(404, "Reunión no encontrada.")
    get_approved_community(db, mt.community_id)
    require_member(db, user, mt.community_id)
    return mt


def set_attendance(db: Session, mt: Meeting, user: User, response: str, channel: str = "web") -> None:
    a = db.scalar(select(Attendance).where(Attendance.meeting_id == mt.id, Attendance.user_id == user.id))
    if a:
        a.response, a.channel = response, channel
    else:
        db.add(Attendance(meeting_id=mt.id, user_id=user.id, response=response, channel=channel))
    log(db, "asistencia", f"{user.full_name}: {response} ({mt.title})", user.id, mt.community_id)


@router.post("/meetings/{mid}/attendance")
def attend(mid: int, body: AttendanceIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    mt = _meeting_for_member(db, mid, user)
    if mt.cancelled:
        raise HTTPException(409, "La reunión fue cancelada.")
    set_attendance(db, mt, user, body.response)
    db.commit()
    return meeting_out(db, mt, user)


@router.get("/meetings/{mid}/attendance")
def attendance_list(mid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    mt = _meeting_for_member(db, mid, user)
    require_representative(db, user, mt.community_id)
    rows = db.execute(select(Attendance, User).join(User, User.id == Attendance.user_id).where(Attendance.meeting_id == mid)).all()
    return [{"user_name": u.full_name, "response": a.response, "channel": a.channel} for a, u in rows]


@router.post("/meetings/{mid}/cancel")
def cancel_meeting(mid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    mt = _meeting_for_member(db, mid, user)
    require_representative(db, user, mt.community_id)
    mt.cancelled = True
    log(db, "reunion_cancelada", mt.title, user.id, mt.community_id)
    db.commit()
    return meeting_out(db, mt, user)


@router.post("/meetings/{mid}/remind")
def remind(mid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Genera recordatorios para miembros que aceptaron WhatsApp. En el prototipo quedan como 'simulado'."""
    from app.services.whatsapp.channels import get_channel

    mt = _meeting_for_member(db, mid, user)
    require_representative(db, user, mt.community_id)
    c = db.get(Community, mt.community_id)
    if mt.cancelled:
        raise HTTPException(409, "La reunión fue cancelada.")
    if mt.starts_at < local_now():
        raise HTTPException(409, "No se pueden enviar recordatorios para una reunión pasada.")
    recipients = db.scalars(select(User).join(Membership, Membership.user_id == User.id).where(
        Membership.community_id == mt.community_id, Membership.status == "approved",
        User.is_active.is_(True), User.whatsapp_opt_in.is_(True))).all()
    channel = get_channel()
    body = (f"📅 Recordatorio AgroBolivia\nReunión: {mt.title}\nComunidad: {c.name}\n"
            f"Día: {mt.starts_at:%d/%m/%Y} a las {mt.starts_at:%H:%M}\nLugar: {mt.place}\n"
            "¿Va a asistir? Responda SI o NO.")
    sent = 0
    failed = 0
    for r in recipients:
        status = channel.send_template(r.phone, "recordatorio_reunion", [mt.title, c.name, f"{mt.starts_at:%d/%m %H:%M}", mt.place])
        db.add(OutboundMessage(user_id=r.id, template="recordatorio_reunion", body=body, meeting_id=mt.id, channel=channel.name, status=status))
        if status == "enviado":
            sent += 1
        elif status == "error":
            failed += 1
    log(db, "recordatorio", f"{mt.title}: {sent} enviados, {failed} errores ({channel.name})", user.id, mt.community_id)
    db.commit()
    message = ("Recordatorios generados en el SIMULADOR (no se enviaron mensajes reales)." if not channel.connected
               else f"Recordatorios enviados: {sent}; con error: {failed}.")
    return {"recipients": len(recipients), "sent": sent, "failed": failed,
            "channel": channel.name, "connected": channel.connected, "message": message}


# ---------- Avisos ----------

@router.get("/communities/{cid}/notices")
def list_notices(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_approved_community(db, cid)
    require_member(db, user, cid)
    rows = db.execute(select(Notice, User).join(User, User.id == Notice.author_id).where(Notice.community_id == cid).order_by(Notice.created_at.desc()).limit(50)).all()
    return [{"id": n.id, "title": n.title, "body": n.body, "category": n.category, "author": u.full_name,
             "author_role": "Representante verificado" if u.role != "admin" else "Administrador",
             "created_at": n.created_at.isoformat(timespec="minutes") + "+00:00"} for n, u in rows]


@router.post("/communities/{cid}/notices", status_code=201)
def create_notice(cid: int, body: NoticeIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_approved_community(db, cid)
    require_representative(db, user, cid)
    n = Notice(community_id=cid, title=body.title, body=body.body, category=body.category, author_id=user.id)
    db.add(n)
    log(db, "aviso_publicado", body.title, user.id, cid)
    db.commit()
    return {"id": n.id, "title": n.title}


# ---------- Observaciones comunitarias ----------

def create_observation(db: Session, c: Community, user: User, kind: str, description: str, observed_at: datetime | None, channel: str = "web") -> Observation:
    recent = db.scalar(select(func.count(Observation.id)).where(Observation.user_id == user.id, Observation.created_at >= utcnow() - timedelta(hours=1)))
    if recent >= 5:
        raise HTTPException(429, "Ya envió varios reportes en la última hora.")
    when = to_local_naive(observed_at) if observed_at is not None else local_now()
    if when > local_now() + timedelta(minutes=10) or when < local_now() - timedelta(days=7):
        raise HTTPException(422, "La fecha de la observación debe ser de los últimos 7 días.")
    o = Observation(community_id=c.id, municipality_id=c.municipality_id, user_id=user.id, kind=kind,
                    description=description, observed_at=when, channel=channel)
    db.add(o)
    log(db, "observacion", f"{KIND_LABEL[kind]} reportado por {user.full_name}", user.id, c.id)
    return o


@router.get("/communities/{cid}/observations")
def list_observations(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_approved_community(db, cid)
    require_member(db, user, cid)
    rows = db.execute(select(Observation, User).join(User, User.id == Observation.user_id).where(Observation.community_id == cid).order_by(Observation.observed_at.desc()).limit(50)).all()
    return [{"id": o.id, "kind": o.kind, "kind_label": KIND_LABEL[o.kind], "description": o.description, "author": u.full_name,
             "observed_at": o.observed_at.isoformat(timespec="minutes") + "-04:00", "review_status": o.review_status, "channel": o.channel,
             "label": "Observación comunitaria (no es un aviso oficial)"} for o, u in rows]


@router.post("/communities/{cid}/observations", status_code=201)
def post_observation(cid: int, body: ObservationIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_approved_community(db, cid)
    require_member(db, user, cid)
    o = create_observation(db, c, user, body.kind, body.description, body.observed_at)
    db.commit()
    return {"id": o.id, "label": "Observación comunitaria registrada. No es un aviso oficial."}


@router.post("/observations/{oid}/review")
def review_observation(oid: int, body: ReviewIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    o = db.get(Observation, oid)
    if o is None:
        raise HTTPException(404, "Observación no encontrada.")
    get_approved_community(db, o.community_id)
    require_representative(db, user, o.community_id)
    o.review_status, o.reviewed_by = body.status, user.id
    log(db, "observacion_revisada", f"#{o.id}: {body.status}", user.id, o.community_id)
    db.commit()
    return {"id": o.id, "review_status": o.review_status}


# ---------- Historial ----------

@router.get("/communities/{cid}/activity")
def activity(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_approved_community(db, cid)
    require_member(db, user, cid)
    rows = db.scalars(select(ActivityLog).where(ActivityLog.community_id == cid).order_by(ActivityLog.created_at.desc()).limit(40)).all()
    return [{"action": a.action, "detail": a.detail, "created_at": a.created_at.isoformat(timespec="minutes") + "+00:00"} for a in rows]
