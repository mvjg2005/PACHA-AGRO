import hashlib
import hmac
import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.ratelimit import chat_limiter, client_key
from app.db import get_db
from app.deps import current_user, optional_user
from app.models import OutboundMessage, User
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


@router.post("/simulate")
def simulate(body: ChatIn, request: Request, mode: str = Query("real", pattern="^(real|simulado)$"),
             user: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    chat_limiter.check(client_key(request))
    key = f"user:{user.id}:{body.session_id}" if user else f"anon:{client_key(request)}:{body.session_id}"
    replies = assistant.handle(db, key, body.text, user, mode)
    return {"channel": "simulador", "connected": False, "replies": replies}


@router.get("/inbox")
def inbox(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(OutboundMessage).where(OutboundMessage.user_id == user.id).order_by(OutboundMessage.id.desc()).limit(20))
    return [{"id": m.id, "template": m.template, "body": m.body, "status": m.status, "channel": m.channel,
             "created_at": m.created_at.isoformat(timespec="minutes") + "+00:00"} for m in rows]


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
    if len(raw) > 1_048_576:
        raise HTTPException(413, "El webhook supera el tamaño permitido.")
    expected = "sha256=" + hmac.new(s.whatsapp_app_secret.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, request.headers.get("X-Hub-Signature-256", "")):
        raise HTTPException(401, "Firma inválida.")
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(400, "El webhook debe contener JSON válido.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(400, "El webhook debe contener un objeto JSON.")
    channel = get_channel()
    if not channel.connected:
        raise HTTPException(503, "Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID.")
    entries = payload.get("entry", [])
    if not isinstance(entries, list):
        raise HTTPException(400, "El campo entry del webhook no es válido.")
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        changes = entry.get("changes", [])
        if not isinstance(changes, list):
            continue
        for change in changes:
            if not isinstance(change, dict):
                continue
            value = change.get("value", {})
            if not isinstance(value, dict):
                continue
            messages = value.get("messages", [])
            if not isinstance(messages, list):
                continue
            for msg in messages:
                if not isinstance(msg, dict) or msg.get("type") != "text":
                    continue
                sender = msg.get("from")
                text_payload = msg.get("text")
                body = text_payload.get("body") if isinstance(text_payload, dict) else None
                if not isinstance(sender, str) or not sender.isdigit() or not isinstance(body, str) or not body.strip():
                    logger.warning("Mensaje de WhatsApp omitido por estructura inválida")
                    continue
                try:
                    received_at = datetime.fromtimestamp(int(msg.get("timestamp")), timezone.utc)
                except (TypeError, ValueError, OSError):
                    logger.warning("Mensaje de WhatsApp omitido por timestamp inválido")
                    continue
                age = datetime.now(timezone.utc) - received_at
                if age > timedelta(hours=24) or age < timedelta(minutes=-5):
                    logger.warning("Mensaje de WhatsApp omitido fuera de la ventana de 24 horas")
                    continue
                phone = "+" + sender
                user = db.scalar(select(User).where(User.phone == phone, User.is_active.is_(True)))
                for reply in assistant.handle(db, f"wa:{phone}", body, user):
                    channel.send_text(phone, reply)
    return {"ok": True}
