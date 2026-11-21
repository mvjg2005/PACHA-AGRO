"""Avisos regionales segmentados (adaptado de PACHAAGRO).

* Publican: administrador o editor de contenido.
* Lectura pública (sin cuenta), filtrable por ubicación y cultivo.
* Siempre etiquetados como avisos de la plataforma, no oficiales.
* Notificación por WhatsApp solo a quienes aceptaron y les corresponde el aviso (simulada sin credenciales).
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.data.catalog import crops_config, department_ids, get_municipality, locations
from app.core.time import as_local_naive, local_now
from app.db import get_db
from app.deps import current_user, optional_user
from app.models import OutboundMessage, RegionalNotice, User
from app.schemas import RegionalNoticeIn
from app.services.activity import log
from app.services.audience import AudienceContext, notice_matches

router = APIRouter(prefix="/api/notices", tags=["avisos regionales"])

KIND_LABEL = {"aviso": "Aviso", "comunicado": "Comunicado", "clima": "Aviso de clima", "evento": "Evento"}
DISCLAIMER = "Aviso de la plataforma AgroBolivia. No es un aviso oficial del SENAMHI ni de otra autoridad."


def require_publisher(user: User = Depends(current_user)) -> User:
    if user.role not in ("admin", "editor"):
        raise HTTPException(403, "Solo administradores o editores de contenido pueden publicar avisos regionales.")
    return user


def _dept_name(did: str | None) -> str | None:
    return next((d["name"] for d in locations()["departments"] if d["id"] == did), None)


def scope_label(n: RegionalNotice) -> str:
    if n.scope == "nacional":
        return "Todo el país"
    if n.scope == "departamento":
        return f"Departamento de {_dept_name(n.department_id)}"
    if n.scope == "municipio":
        m = get_municipality(n.municipality_id or "")
        return f"Municipio de {m['name']} ({m['department_name']})" if m else "Municipio"
    crop = crops_config()["crops"].get(n.crop_id or "", {})
    return f"Productores de {crop.get('name', n.crop_id or '').lower()}"


def notice_out(n: RegionalNotice, author: User | None) -> dict:
    return {
        "id": n.id, "title": n.title, "summary": n.summary, "body": n.body, "kind": n.kind,
        "kind_label": KIND_LABEL[n.kind], "scope": n.scope, "scope_label": scope_label(n),
        "department_id": n.department_id, "municipality_id": n.municipality_id, "crop_id": n.crop_id,
        "author": author.full_name if author else None,
        "author_role": {"admin": "Administración", "editor": "Editor de contenido"}.get(author.role, "") if author else "",
        "is_demo": n.is_demo, "created_at": n.created_at.isoformat(timespec="minutes"),
        "expires_at": n.expires_at.isoformat(timespec="minutes") if n.expires_at else None,
        "disclaimer": DISCLAIMER,
    }


def active_query():
    now = local_now()
    q = select(RegionalNotice).where(RegionalNotice.archived.is_(False),
                                     or_(RegionalNotice.expires_at.is_(None), RegionalNotice.expires_at > now))
    # Igual que cuentas y comunidades DEMO: sin SEED_DEMO los ejemplos no se muestran (p. ej. en producción).
    if not get_settings().seed_demo:
        q = q.where(RegionalNotice.is_demo.is_(False))
    return q


def context_for(municipality_id: str | None, crops: list[str]) -> AudienceContext:
    m = get_municipality(municipality_id) if municipality_id else None
    return AudienceContext(department_id=m["department_id"] if m else None, municipality_id=m["id"] if m else None, crops=crops)


def matching_notices(db: Session, ctx: AudienceContext) -> list[RegionalNotice]:
    rows = db.scalars(active_query().order_by(RegionalNotice.created_at.desc())).all()
    return [n for n in rows if notice_matches(n.scope, n.department_id, n.municipality_id, n.crop_id, ctx)]


@router.get("")
def list_notices(municipality_id: str | None = Query(None, max_length=60),
                 crops: str | None = Query(None, max_length=200, description="Cultivos separados por coma"),
                 mine: bool = False, user: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    """Sin filtros: todos los avisos vigentes. Con ubicación/cultivos (o mine=true con sesión): solo los que le corresponden."""
    if mine and user:
        ctx = context_for(municipality_id or user.default_municipality_id, user.crops)
    elif municipality_id or crops:
        ctx = context_for(municipality_id, [c for c in (crops or "").split(",") if c])
    else:
        ctx = None
    rows = matching_notices(db, ctx) if ctx else db.scalars(active_query().order_by(RegionalNotice.created_at.desc())).all()
    authors = {u.id: u for u in db.scalars(select(User).where(User.id.in_({n.author_id for n in rows})))} if rows else {}
    return [notice_out(n, authors.get(n.author_id)) for n in rows]


def _validate_scope(body: RegionalNoticeIn) -> dict:
    """Valida la jerarquía departamento → municipio y completa campos derivados."""
    f = {"department_id": None, "municipality_id": None, "crop_id": None}
    if body.scope == "departamento":
        if body.department_id not in department_ids():
            raise HTTPException(422, "Elija un departamento válido.")
        f["department_id"] = body.department_id
    elif body.scope == "municipio":
        m = get_municipality(body.municipality_id or "")
        if not m:
            raise HTTPException(422, "Elija un municipio válido.")
        if body.department_id and body.department_id != m["department_id"]:
            raise HTTPException(422, "El municipio no pertenece al departamento elegido.")
        f["department_id"], f["municipality_id"] = m["department_id"], m["id"]
    elif body.scope == "cultivo":
        if body.crop_id not in crops_config()["crops"]:
            raise HTTPException(422, "Elija un cultivo válido.")
        f["crop_id"] = body.crop_id
    return f


@router.post("", status_code=201)
def create_notice(body: RegionalNoticeIn, user: User = Depends(require_publisher), db: Session = Depends(get_db)):
    f = _validate_scope(body)
    expires = as_local_naive(body.expires_at) if body.expires_at else None
    if expires and expires <= local_now():
        raise HTTPException(422, "La fecha de vigencia ya pasó.")
    n = RegionalNotice(title=body.title, summary=body.summary, body=body.body, kind=body.kind, scope=body.scope,
                       expires_at=expires, author_id=user.id, **f)
    db.add(n)
    db.flush()
    log(db, "aviso_regional", f"{n.title} ({scope_label(n)})", user.id)
    db.commit()
    return notice_out(n, user)


@router.post("/{nid}/archive")
def archive(nid: int, user: User = Depends(require_publisher), db: Session = Depends(get_db)):
    n = db.get(RegionalNotice, nid)
    if n is None:
        raise HTTPException(404, "Aviso no encontrado.")
    n.archived = True
    log(db, "aviso_regional_archivado", n.title, user.id)
    db.commit()
    return {"id": n.id, "archived": True}


@router.post("/{nid}/notify")
def notify(nid: int, user: User = Depends(require_publisher), db: Session = Depends(get_db)):
    """Envía el aviso por WhatsApp (plantilla 'aviso_regional') a quienes aceptaron y les corresponde."""
    from app.services.whatsapp.channels import get_channel
    from app.services.whatsapp.templates import regional_notice_template

    n = db.get(RegionalNotice, nid)
    if n is None or n.archived:
        raise HTTPException(404, "Aviso no encontrado.")
    channel = get_channel()
    tpl = regional_notice_template(n.title, n.summary, scope_label(n))
    sent = 0
    for u in db.scalars(select(User).where(User.whatsapp_opt_in.is_(True), User.is_active.is_(True))):
        if not notice_matches(n.scope, n.department_id, n.municipality_id, n.crop_id, context_for(u.default_municipality_id, u.crops)):
            continue
        res = channel.send_template(u.phone, tpl["name"], tpl["parameters"])
        db.add(OutboundMessage(user_id=u.id, template=tpl["name"], body=tpl["preview"], notice_id=n.id,
                               channel=channel.name, status=res["status"], wa_message_id=res.get("id")))
        sent += 1
    log(db, "aviso_regional_notificado", f"{n.title}: {sent} destinatarios ({channel.name})", user.id)
    db.commit()
    return {"recipients": sent, "channel": channel.name, "connected": channel.connected,
            "message": "Notificaciones generadas en el SIMULADOR (no se enviaron mensajes reales)." if not channel.connected
            else f"Aviso enviado a {sent} personas."}
