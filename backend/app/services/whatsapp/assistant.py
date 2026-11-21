"""Asistente conversacional. El MISMO código atiende al simulador web y al webhook oficial.
Respuestas cortas, en español sencillo, siempre indicando la fuente de los datos."""
from datetime import date, datetime, timedelta

from app.core.time import local_now

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.data.catalog import find_municipality_by_name, get_municipality
from app.models import Community, Meeting, Membership, OutboundMessage, User, utcnow
from app.services.recommendation.engine import Answers
from app.services.recommendation.run import recommend
from app.services.whatsapp.intents import detect
from app.services.weather.service import get_weather

# Estado en palabras (mensajes sobrios, sin emoticones)
STATE_WORD = {"verde": "a favor", "amarillo": "precaución", "rojo": "en contra", "gris": "sin datos"}
MENU = ("Hola, soy el asistente de AgroBolivia.\nEscriba un número o su pregunta:\n"
        "1. ¿Cuándo puedo sembrar?\n2. ¿Hay riesgo de helada? (o CLIMA <municipio>)\n3. Reunión de mi comunidad\n4. Avisar granizo o helada\n"
        "5. AVISOS de mi zona\n6. GUIAS para aprender\nCULTIVOS: ver mis cultivos\n"
        "Escriba BAJA para no recibir más mensajes.")

# Estado de conversación guardado en la base de datos (tabla chat_state): sobrevive a reinicios y
# despliegues, algo necesario con WhatsApp real. Expira tras 30 minutos sin mensajes.
_TTL = 30 * 60
_STATE_SAVE_COUNT = 0


def _load_state(db: Session, key: str) -> dict:
    import json

    from app.models import ChatState, utcnow
    row = db.get(ChatState, key)
    if not row or (utcnow() - row.updated_at).total_seconds() > _TTL:
        return {}
    try:
        return json.loads(row.data)
    except ValueError:
        return {}


def _save_state(db: Session, key: str, st: dict) -> None:
    import json

    global _STATE_SAVE_COUNT
    from app.models import ChatState, utcnow
    now = utcnow()
    _STATE_SAVE_COUNT += 1
    # Purgar periódicamente conversaciones sin actividad para evitar acumulación indefinida.
    if _STATE_SAVE_COUNT % 100 == 0:
        db.query(ChatState).filter(ChatState.updated_at < now - timedelta(days=1)).delete(synchronize_session=False)
    row = db.get(ChatState, key) or ChatState(key=key)
    row.data, row.updated_at = json.dumps(st, ensure_ascii=False), now
    db.merge(row)
    db.commit()


def reset_state() -> None:
    """Borra todas las conversaciones guardadas (usado en pruebas)."""
    from app import db as dbmod
    from app.models import ChatState
    try:
        with dbmod.SessionLocal() as s:
            s.query(ChatState).delete()
            s.commit()
    except Exception:  # noqa: BLE001
        pass


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
    st = _load_state(db, key)
    try:
        return _handle(db, st, text, user, mode, today)
    finally:
        try:
            _save_state(db, key, st)
        except Exception:  # noqa: BLE001
            db.rollback()


def _handle(db: Session, st: dict, text: str, user: User | None, mode: str, today: date | None) -> list[str]:
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
    if intent == "unknown" and found:
        return [f"Listo, usaré {found['name']} ({found['department_name']}). ¿Qué quiere saber?\n"
                "Escriba CLIMA, AVISOS o «¿cuándo puedo sembrar quinua?»."]
    if intent == "menu" or intent == "unknown":
        return [MENU] if intent == "menu" else ["No entendí bien.", MENU]
    if intent == "opt_out":
        if user:
            user.whatsapp_opt_in = False
            db.commit()
        return ["Ya no le enviaremos recordatorios ni avisos. Escriba ALTA si quiere volver a recibirlos."]
    if intent == "opt_in":
        if not user:
            return ["Para recibir avisos necesita registrarse en AgroBolivia con este número."]
        user.whatsapp_opt_in, user.whatsapp_opt_in_at = True, utcnow()
        db.commit()
        return ["Aceptó recibir recordatorios y avisos de su comunidad. Escriba BAJA cuando quiera dejar de recibirlos."]
    if intent in ("yes", "no"):
        return [_attendance(db, user, intent, st)]
    if intent == "meeting":
        return [_next_meeting(db, user, st)]
    if intent == "report":
        return _start_report(db, user, it.get("kind"), text, st)
    if intent == "library":
        return [_library(it.get("crop"))]
    if intent == "my_crops":
        if not user:
            return ["Para guardar sus cultivos necesita una cuenta en AgroBolivia."]
        names = ", ".join(user.crops) if user.crops else "ninguno todavía"
        return [f"Sus cultivos de interés: {names}.\nPuede cambiarlos en la web, en Mi cuenta."]
    if intent == "notices":
        loc = _user_location(db, user, st)
        return [_notices(db, user, loc)]

    loc = _user_location(db, user, st)
    if loc is None:
        st["pending"] = {"type": intent, "crop": it.get("crop"), "tomorrow": it.get("tomorrow", False)}
        return ["¿En qué municipio está? Ejemplo: Oruro, Challapata, El Alto, Montero."]
    if intent == "weather":
        return [_weather(loc, it.get("tomorrow", False), mode, today)]
    if intent == "sowing":
        crop = it.get("crop")
        if not crop:
            st["pending"] = {"type": "sowing"}
            st["await_crop"] = True
            return ["¿Qué quiere sembrar? Quinua, papa, maíz, haba o cebada."]
        return _sowing(db, loc, crop, mode, today)
    return [MENU]


def _weather(loc, tomorrow, mode, today) -> str:
    wx = get_weather(loc, mode, today)
    f = wx["forecast"]
    if not f["available"]:
        fr = wx["frost_risk"]
        extra = f"\nEn este mes suele haber {wx['climatology']['frost_days_month']:.0f} días con helada (historial NASA POWER)." if fr.get("basis") == "climatologia" else ""
        return f"Ahora no tengo pronóstico para {loc['name']}. Intente más tarde.{extra}\nAvisos oficiales: senamhi.gob.bo"
    day = f["daily"][1] if tomorrow and len(f["daily"]) > 1 else f["daily"][0]
    t = day["tmin"]
    risk = "Riesgo ALTO de helada" if t <= -2 else "Puede haber helada leve" if t <= 1 else "No se espera helada"
    sim = "\nDATOS SIMULADOS (demostración)" if mode == "simulado" else ""
    return (f"{loc['name']} — {'mañana' if tomorrow else 'hoy'} ({day['date']}){sim}\n"
            f"Mínima: {t:.0f} °C · Máxima: {day['tmax']:.0f} °C\nLluvia: {day['precip_mm'] or 0:.0f} mm\n{risk}\n"
            f"Fuente: {f['source']} (pronóstico, no es aviso oficial).")


def _sowing(db, loc, crop, mode, today) -> list[str]:
    r = recommend(db, loc, Answers(crop, None, "no_se", "secano"), mode, today)
    lines = [f"Resultado: {r['headline']} — {r['crop_name']} en {loc['name']}", r["summary"]]
    if r.get("main_action"):
        lines.append(f"Qué hacer: {r['main_action']}")
    for c in r["criteria"][:4]:
        lines.append(f"• {c['label']} ({STATE_WORD[c['status']]}): {c['explanation']}")
    if r["scenario_status"] == "demo":
        lines.append("Nota: reglas de demostración, no validadas.")
    lines.append("Supuse que no tiene riego y no sabe la humedad. Para un análisis completo use la web: “¿Cuándo puedo sembrar?”")
    return ["\n".join(lines)]


def _next_meeting(db, user, st: dict) -> str:
    if not user:
        return "Para ver reuniones necesita registrarse en AgroBolivia y unirse a su comunidad."
    comms = _user_communities(db, user)
    if not comms:
        return "Aún no es miembro aprobado de ninguna comunidad."
    mt = db.scalar(select(Meeting).where(
        Meeting.community_id.in_([c.id for c in comms]),
        Meeting.cancelled.is_(False),
        Meeting.starts_at >= local_now() - timedelta(hours=2),
    ).order_by(Meeting.starts_at))
    if not mt:
        return "No hay reuniones programadas en su comunidad."
    st["pending_meeting_id"] = mt.id
    c = db.get(Community, mt.community_id)
    return (f"Próxima reunión — {c.name}\n{mt.title}\nDía: {mt.starts_at:%d/%m/%Y} a las {mt.starts_at:%H:%M}\n"
            f"Lugar: {mt.place}\n¿Va a asistir? Responda SI o NO.")


def _attendance(db, user, intent, st: dict | None = None) -> str:
    from app.routers.communities import set_attendance

    if not user:
        return "Para confirmar asistencia necesita una cuenta en AgroBolivia."
    st = st or {}
    comms = _user_communities(db, user)
    community_ids = [c.id for c in comms]
    now = local_now()
    pending_meeting_id = st.get("pending_meeting_id")
    mt = db.get(Meeting, pending_meeting_id) if pending_meeting_id else None

    # Una respuesta a la pregunta de asistencia solo puede confirmar esa reunión.
    if pending_meeting_id:
        if (mt is None or mt.cancelled or mt.community_id not in community_ids
                or mt.starts_at < now - timedelta(hours=6)):
            st.pop("pending_meeting_id", None)
            return "La reunión que consultó ya no está disponible. Vuelva a preguntar por la próxima reunión."
    else:
        # Tras reiniciar el proceso o vencer el estado, solo aceptar un recordatorio
        # persistido y verificable de una reunión vigente.
        last = None
        if community_ids:
            last = db.scalar(
                select(OutboundMessage)
                .join(Meeting, OutboundMessage.meeting_id == Meeting.id)
                .where(
                    OutboundMessage.user_id == user.id,
                    OutboundMessage.status.in_(("simulado", "enviado", "entregado", "leido")),
                    Meeting.community_id.in_(community_ids),
                    Meeting.cancelled.is_(False),
                    Meeting.starts_at >= now - timedelta(hours=6),
                )
                .order_by(OutboundMessage.id.desc())
            )
        mt = db.get(Meeting, last.meeting_id) if last else None

    if (mt is None or mt.cancelled or mt.community_id not in community_ids
            or mt.starts_at < now - timedelta(hours=6)):
        st.pop("pending_meeting_id", None)
        return "No encontré una reunión vigente para confirmar."
    set_attendance(db, mt, user, "si" if intent == "yes" else "no", channel="whatsapp")
    db.commit()
    st.pop("pending_meeting_id", None)
    choice = "SÍ" if intent == "yes" else "NO"
    return f"Gracias. Registramos que {choice} asistirá a: {mt.title} ({mt.starts_at:%d/%m %H:%M})."


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
    try:
        create_observation(db, c, user, pending["kind"], f"Vía WhatsApp: {pending['text'][:200]}", None, channel="whatsapp_sim")
        db.commit()
    except HTTPException as e:
        return f"{e.detail}"
    return "Gracias. Su reporte quedó registrado como observación comunitaria. Su representante lo verá."


def _notices(db, user, loc) -> str:
    from app.routers.notices import context_for, matching_notices, scope_label

    ctx = context_for(loc["id"] if loc else None, user.crops if user else [])
    rows = matching_notices(db, ctx)[:3]
    where = f" para {loc['name']}" if loc else " nacionales (dígame su municipio para ver los de su zona)"
    if not rows:
        return f"No hay avisos vigentes{where}."
    lines = [f"Avisos de la plataforma{where}:"]
    for n in rows:
        lines.append(f"• {n.title}{' (DEMO)' if n.is_demo else ''} — {scope_label(n)}")
    lines.append("No son avisos oficiales. Oficiales: senamhi.gob.bo")
    return "\n".join(lines)


def _library(crop) -> str:
    from app.routers.education import _library as lib

    items = [i for i in lib()["items"] if not crop or i["crop"] in (None, crop)][:4]
    lines = ["Guías para aprender:"] + [f"• {i['title']} ({i['reading_minutes']} min)" for i in items]
    lines.append("Léalas en la web, sección Aprender → Biblioteca.")
    return "\n".join(lines)
