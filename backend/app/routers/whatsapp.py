import hashlib
import hmac
import json
import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.ratelimit import chat_limiter, client_key
from app.db import get_db
from app.deps import current_user, optional_user
from app.models import InboundMessage, OutboundMessage, User, utcnow
from app.schemas import ChatIn
from app.services.whatsapp import assistant
from app.services.whatsapp.channels import get_channel

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])
logger = logging.getLogger("agrobolivia.whatsapp")


@router.get("/status")
def status():
    ch = get_channel()
    return {"channel": ch.name, "connected": ch.connected,
            "message": "WhatsApp Business conectado." if ch.connected else
            "SIMULADOR: WhatsApp no está conectado. Las conversaciones y recordatorios son simulados."}


@router.get("/templates")
def templates():
    """Contratos de plantillas para registrar en Meta (los mensajes proactivos solo pueden usar plantillas aprobadas)."""
    from app.services.whatsapp.templates import TEMPLATE_CONTRACTS

    return TEMPLATE_CONTRACTS


@router.post("/simulate")
def simulate(body: ChatIn, request: Request, mode: str = Query("real", pattern="^(real|simulado)$"),
             user: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    chat_limiter.check(client_key(request))
    key = f"user:{user.id}" if user else f"anon:{client_key(request)}:{body.session_id}"
    replies = assistant.handle(db, key, body.text, user, mode)
    return {"channel": "simulador", "connected": False, "replies": replies}


@router.get("/inbox")
def inbox(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(OutboundMessage).where(OutboundMessage.user_id == user.id).order_by(OutboundMessage.id.desc()).limit(20))
    return [{"id": m.id, "template": m.template, "body": m.body, "status": m.status, "channel": m.channel,
             "created_at": m.created_at.isoformat(timespec="minutes")} for m in rows]


# ---- Webhook oficial de WhatsApp Cloud API (inactivo sin credenciales) ----

@router.get("/webhook")
def verify(mode: str = Query("", alias="hub.mode"), token: str = Query("", alias="hub.verify_token"),
           challenge: str = Query("", alias="hub.challenge")):
    s = get_settings()
    if s.whatsapp_verify_token and mode == "subscribe" and hmac.compare_digest(token, s.whatsapp_verify_token):
        return Response(content=challenge, media_type="text/plain")
    raise HTTPException(403, "Verificación fallida.")


@router.post("/webhook")
async def receive(request: Request, db: Session = Depends(get_db)):
    s = get_settings()
    if not (s.whatsapp_enabled and s.whatsapp_app_secret):
        raise HTTPException(503, "WhatsApp no está configurado en este servidor.")
    raw = await request.body()
    expected = "sha256=" + hmac.new(s.whatsapp_app_secret.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, request.headers.get("X-Hub-Signature-256", "")):
        raise HTTPException(401, "Firma inválida.")
    payload = json.loads(raw)
    # Conserva la ventana de deduplicación de Meta, pero evita crecimiento indefinido.
    db.execute(delete(InboundMessage).where(InboundMessage.received_at < utcnow() - timedelta(days=30)))
    channel = get_channel()
    handled = {"messages": 0, "statuses": 0}
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            # Estados de entrega de mensajes salientes (adaptado de PACHAAGRO).
            for st in change.get("value", {}).get("statuses", []):
                if update_message_status(db, st.get("id", ""), st.get("status", ""), (st.get("errors") or [{}])[0].get("title")):
                    handled["statuses"] += 1
            for msg in change.get("value", {}).get("messages", []):
                if msg.get("type") != "text":
                    continue
                message_id = msg.get("id")
                # Meta puede reintentar el mismo webhook cuando no recibe una respuesta.
                # Sin ID no procesamos: no se puede garantizar idempotencia.
                if not message_id or _claim_inbound_message(db, message_id):
                    continue
                phone = "+" + msg["from"]
                user = db.scalar(select(User).where(User.phone == phone, User.is_active.is_(True)))
                for reply in assistant.handle(db, f"wa:{phone}", msg["text"]["body"], user):
                    result = channel.send_text(phone, reply)
                    if result.get("status") == "fallido":
                        # La respuesta del asistente puede haber producido efectos persistidos
                        # (asistencia, reporte o avance de conversación). Mantener el wamid evita
                        # que un reintento de Meta repita esos efectos.
                        logger.error("No se pudo entregar la respuesta de WhatsApp para el mensaje %s", message_id)
                handled["messages"] += 1
    db.commit()
    return {"ok": True, **handled}


def _claim_inbound_message(db: Session, message_id: str) -> bool:
    """Registra el ID de Meta con una inserción atómica; True indica que ya fue procesado."""
    if db.get(InboundMessage, message_id):
        return True
    try:
        with db.begin_nested():
            db.add(InboundMessage(wa_message_id=message_id))
            db.flush()
    except IntegrityError:
        return True
    return False


META_STATUS = {"sent": "enviado", "delivered": "entregado", "read": "leido", "failed": "fallido"}
_ORDER = ["simulado", "enviado", "entregado", "leido"]


def update_message_status(db: Session, wa_id: str, meta_status: str, error: str | None = None) -> bool:
    """Actualiza el historial con el estado que informa Meta. No retrocede (leído no vuelve a entregado)."""
    new = META_STATUS.get(meta_status)
    if not wa_id or not new:
        return False
    msg = db.scalar(select(OutboundMessage).where(OutboundMessage.wa_message_id == wa_id))
    if msg is None:
        return False
    if new != "fallido" and msg.status in _ORDER and _ORDER.index(new) <= _ORDER.index(msg.status):
        return True
    from app.models import utcnow

    msg.status, msg.updated_at = new, utcnow()
    if error:
        msg.error = error[:300]
    return True
