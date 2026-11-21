"""Asistente conversacional. El MISMO código atiende al simulador web y al webhook oficial.
Respuestas cortas, en español sencillo, siempre indicando la fuente de los datos."""
import time
from datetime import date, timedelta

from app.core.time import local_now

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.data.catalog import find_municipality_by_name, get_municipality
from app.models import Community, Meeting, Membership, OutboundMessage, User, utcnow
from app.services.recommendation.engine import Answers
from app.services.recommendation.run import recommend
from app.services.whatsapp.intents import detect
from app.services.weather.service import get_weather

EMOJI = {"verde": "🟢", "amarillo": "🟡", "rojo": "🔴", "gris": "⚪"}
MENU = ("👋 Hola, soy el asistente de AgroBolivia.\nEscriba un número o su pregunta:\n"
        "1️⃣ ¿Cuándo puedo sembrar?\n2️⃣ ¿Hay riesgo de helada?\n3️⃣ Reunión de mi comunidad\n4️⃣ Avisar granizo o helada\n"
        "Escriba BAJA para no recibir más mensajes.")

# Estado de conversación en memoria (prototipo). En producción: Redis o tabla con expiración.
_STATE: dict[str, dict] = {}
_TTL = 30 * 60


def _state(key: str) -> dict:
    now = time.time()
    if len(_STATE) >= 5_000:
        expired = [k for k, value in _STATE.items() if now - value.get("_t", 0) > _TTL]
        for expired_key in expired:
            _STATE.pop(expired_key, None)
        # Evicta las sesiones más antiguas si muchas siguen activas.
        overflow = len(_STATE) - 4_999
        if overflow > 0:
            oldest = sorted(_STATE, key=lambda k: _STATE[k].get("_t", 0))[:overflow]
            for old_key in oldest:
                _STATE.pop(old_key, None)
    st = _STATE.get(key)
    if not st or now - st.get("_t", 0) > _TTL:
        st = {}
    st["_t"] = now
    _STATE[key] = st
    return st


def reset_state() -> None:
    _STATE.clear()


def _user_location(db: Session, user: User | None, st: dict) -> dict | None:
    if st.get("municipality_id"):
        return get_municipality(st["municipality_id"])
    if user and user.default_municipality_id:
        return get_municipality(user.default_municipality_id)
    if user:
        c = db.scalar(select(Community).join(Membership).where(Membership.user_id == user.id, Membership.status == "approved"))
        if c:
            return get_municipality(c.municipality_id)
    return None


def _user_communities(db: Session, user: User) -> list[Community]:
    return list(db.scalars(select(Community).join(Membership).where(
        Membership.user_id == user.id, Membership.status == "approved", Community.status == "approved")))


def handle(db: Session, key: str, text: str, user: User | None, mode: str = "real", today: date | None = None) -> list[str]:
    st = _state(key)
    found = find_municipality_by_name(text)
    if found:
        st["municipality_id"] = found["id"]

    pending = st.pop("pending", None)
    it = detect(text)

    # Confirmación de un reporte pendiente
    if pending and pending.get("type") == "report_confirm":
        if it["intent"] == "yes":
            return [_save_report(db, user, pending)]
        return ["Listo, no envié el reporte."]
    if pending and pending.get("type") == "report_kind":
        kind = {"1": "granizo", "2": "helada", "3": "lluvia_fuerte"}.get(text.strip()) or it.get("kind")
        if kind:
            it = {"intent": "report", "kind": kind}
        else:
            return ["No entendí. Responda 1 (granizo), 2 (helada) o 3 (lluvia fuerte)."]
    if pending and pending.get("type") in ("sowing", "weather") and found and it["intent"] == "unknown":
        it = {"intent": pending["type"], "crop": pending.get("crop"), "tomorrow": pending.get("tomorrow", False)}

    intent = it["intent"]
    if intent == "menu" or intent == "unknown":
        return [MENU] if intent == "menu" else ["No entendí bien 🤔.", MENU]
    if intent == "opt_out":
        if user:
            user.whatsapp_opt_in = False
            db.commit()
        return ["✅ Ya no le enviaremos recordatorios ni avisos. Escriba ALTA si quiere volver a recibirlos."]
    if intent == "opt_in":
        if not user:
            return ["Para recibir avisos necesita registrarse en AgroBolivia con este número."]
        user.whatsapp_opt_in, user.whatsapp_opt_in_at = True, utcnow()
        db.commit()
        return ["✅ Aceptó recibir recordatorios y avisos de su comunidad. Escriba BAJA cuando quiera dejar de recibirlos."]
    if intent in ("yes", "no"):
        if pending and pending.get("type") != "attendance":
            return ["No tengo una confirmación de asistencia pendiente."]
        meeting_id = pending.get("meeting_id") if pending else None
        return [_attendance(db, user, intent, meeting_id)]
    if intent == "meeting":
        return [_next_meeting(db, user, st)]
    if intent == "report":
        return _start_report(db, user, it.get("kind"), text, st)

    loc = _user_location(db, user, st)
    if loc is None:
        st["pending"] = {"type": intent, "crop": it.get("crop"), "tomorrow": it.get("tomorrow", False)}
        return ["📍 ¿En qué municipio está? Ejemplo: Oruro, Challapata, El Alto, Montero."]
    if intent == "weather":
        return [_weather(loc, it.get("tomorrow", False), mode, today)]
    if intent == "sowing":
        crop = it.get("crop")
        if not crop:
            st["pending"] = {"type": "sowing"}
            st["await_crop"] = True
            return ["🌱 ¿Qué quiere sembrar? Quinua, papa, maíz, haba o cebada."]
        return _sowing(db, loc, crop, mode, today)
    return [MENU]


def _weather(loc, tomorrow, mode, today) -> str:
    wx = get_weather(loc, mode, today)
    f = wx["forecast"]
    if not f["available"]:
        fr = wx["frost_risk"]
        extra = f"\nEn este mes suele haber {wx['climatology']['frost_days_month']:.0f} días con helada (historial NASA POWER)." if fr.get("basis") == "climatologia" else ""
        return f"⚠️ Ahora no tengo pronóstico para {loc['name']}. Intente más tarde.{extra}\nAvisos oficiales: senamhi.gob.bo"
    day = f["daily"][1] if tomorrow and len(f["daily"]) > 1 else f["daily"][0]
    t = day["tmin"]
    risk = "🔴 Riesgo ALTO de helada" if t <= -2 else "🟡 Puede haber helada leve" if t <= 1 else "🟢 No se espera helada"
    sim = "\n🧪 DATOS SIMULADOS (demostración)" if mode == "simulado" else ""
    return (f"🌦️ {loc['name']} — {'mañana' if tomorrow else 'hoy'} ({day['date']}){sim}\n"
            f"Mínima: {t:.0f} °C · Máxima: {day['tmax']:.0f} °C\nLluvia: {day['precip_mm'] or 0:.0f} mm\n{risk}\n"
            f"Fuente: {f['source']} (pronóstico, no es aviso oficial).")


def _sowing(db, loc, crop, mode, today) -> list[str]:
    r = recommend(db, loc, Answers(crop, None, "no_se", "secano"), mode, today)
    lines = [f"{EMOJI[r['status']]} {r['headline']} — {r['crop_name']} en {loc['name']}", r["summary"]]
    for c in r["criteria"][:4]:
        lines.append(f"{EMOJI[c['status']]} {c['label']}: {c['explanation']}")
    if r["scenario_status"] == "demo":
        lines.append("ℹ️ Reglas de demostración, no validadas.")
    lines.append("Supuse que no tiene riego y no sabe la humedad. Para un análisis completo use la web: “¿Cuándo puedo sembrar?”")
    return ["\n".join(lines)]


def _next_meeting(db, user, st: dict) -> str:
    if not user:
        return "Para ver reuniones necesita registrarse en AgroBolivia y unirse a su comunidad."
    comms = _user_communities(db, user)
    if not comms:
        return "Aún no es miembro aprobado de ninguna comunidad."
    mt = db.scalar(select(Meeting).where(Meeting.community_id.in_([c.id for c in comms]), Meeting.cancelled.is_(False),
                                         Meeting.starts_at >= local_now() - timedelta(hours=2)).order_by(Meeting.starts_at))
    if not mt:
        return "No hay reuniones programadas en su comunidad."
    c = db.get(Community, mt.community_id)
    st["pending"] = {"type": "attendance", "meeting_id": mt.id}
    return (f"📅 Próxima reunión — {c.name}\n{mt.title}\nDía: {mt.starts_at:%d/%m/%Y} a las {mt.starts_at:%H:%M}\n"
            f"Lugar: {mt.place}\n¿Va a asistir? Responda SI o NO.")


def _attendance(db, user, intent, meeting_id: int | None = None) -> str:
    from app.routers.communities import set_attendance

    if not user:
        return "Para confirmar asistencia necesita una cuenta en AgroBolivia."
    comms = _user_communities(db, user)
    mt = db.get(Meeting, meeting_id) if meeting_id is not None else None
    if mt is None:
        last = db.scalar(select(OutboundMessage).where(
            OutboundMessage.user_id == user.id,
            OutboundMessage.meeting_id.is_not(None),
            OutboundMessage.created_at >= utcnow() - timedelta(hours=48),
            OutboundMessage.status.in_(["enviado", "simulado"]),
        ).order_by(OutboundMessage.id.desc()))
        mt = db.get(Meeting, last.meeting_id) if last else None
    if (mt is None or mt.cancelled or mt.starts_at < local_now() - timedelta(hours=2)
            or mt.community_id not in [c.id for c in comms]):
        return "No encontré una reunión vigente para confirmar. Consulte primero la próxima reunión."
    set_attendance(db, mt, user, "si" if intent == "yes" else "no", channel="whatsapp_sim")
    db.commit()
    return f"✅ Gracias. Registramos que {'SÍ' if intent == 'yes' else 'NO'} asistirá a: {mt.title} ({mt.starts_at:%d/%m %H:%M})."


def _start_report(db, user, kind, text, st) -> list[str]:
    if not user:
        return ["Para avisar a su comunidad necesita una cuenta en AgroBolivia (así evitamos reportes falsos)."]
    comms = _user_communities(db, user)
    if not comms:
        return ["Necesita ser miembro aprobado de una comunidad para enviar reportes."]
    if not kind:
        st["pending"] = {"type": "report_kind"}
        return ["¿Qué quiere avisar?\n1 Granizo\n2 Helada\n3 Lluvia fuerte"]
    label = {"granizo": "granizo", "helada": "helada", "lluvia_fuerte": "lluvia fuerte", "sequia": "sequía"}[kind]
    st["pending"] = {"type": "report_confirm", "kind": kind, "community_id": comms[0].id, "text": text}
    return [f"Va a reportar *{label}* hoy en la comunidad {comms[0].name}.\nSerá una OBSERVACIÓN COMUNITARIA, no un aviso oficial.\n¿Confirma? Responda SI o NO."]


def _save_report(db, user, pending) -> str:
    from fastapi import HTTPException

    from app.routers.communities import create_observation

    c = db.get(Community, pending["community_id"])
    if user is None or not user.is_active or c is None or c.status != "approved":
        return "⚠️ Su cuenta o comunidad ya no está habilitada. No registré el reporte."
    membership = db.scalar(select(Membership).where(
        Membership.user_id == user.id, Membership.community_id == c.id, Membership.status == "approved"
    ))
    if membership is None:
        return "⚠️ Ya no pertenece a esa comunidad. No registré el reporte."
    try:
        create_observation(db, c, user, pending["kind"], f"Vía WhatsApp: {pending['text'][:200]}", None, channel="whatsapp_sim")
        db.commit()
    except HTTPException as e:
        return f"⚠️ {e.detail}"
    return "✅ Gracias. Su reporte quedó registrado como observación comunitaria. Su representante lo verá."
