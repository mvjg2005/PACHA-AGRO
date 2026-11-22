"""Boletín de la semana para quien no tiene internet: un SMS corto y un texto para leer por radio.

El SMS va sin tildes ni «ñ»: con esos caracteres el celular usa otra codificación y cada mensaje
cabe en 70 caracteres en vez de 160 (sale el doble de caro). Los datos salen del pronóstico real.
"""
import unicodedata
from datetime import date

from app.services import livestock

DAYS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"]
DAYS_LONG = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def ascii_sms(text: str) -> str:
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return " ".join(t.split())


def _d(s: str, long: bool = False) -> str:
    d = date.fromisoformat(s)
    return f"{(DAYS_LONG if long else DAYS)[d.weekday()]} {d.day}"


def build(m: dict) -> dict:
    from app.services.weather.service import get_weather
    wx = get_weather(m, "real")
    f = wx["forecast"]
    if not f.get("available") or not f.get("daily"):
        return {"available": False, "error": "El pronóstico no está disponible ahora. Intente más tarde."}
    days = f["daily"][:7]
    herd = livestock.nights(m)
    nights = {n["date"]: n for n in herd.get("nights", [])} if herd.get("available") else {}

    frost = [d for d in days if d.get("tmin") is not None and d["tmin"] <= -2]
    hard = [d for d in frost if d["tmin"] <= -6]
    snow = [d for d in days if nights.get(d["date"], {}).get("snow")]
    rain = round(sum(d.get("precip_mm") or 0 for d in days))
    danger = [d for d in days if nights.get(d["date"], {}).get("level") in ("alto", "extremo")]
    coldest = min((d for d in days if d.get("tmin") is not None), key=lambda d: d["tmin"], default=None)

    # SMS (máximo ~300 caracteres, 2 mensajes)
    parts = [f"PACHA-AGRO {m['name']} {date.fromisoformat(days[0]['date']).strftime('%d/%m')}:"]
    if hard:
        parts.append("Helada fuerte " + ", ".join(f"{_d(d['date'])} ({round(d['tmin'])}C)" for d in hard[:3]) + ".")
    elif frost:
        parts.append("Helada " + ", ".join(f"{_d(d['date'])} ({round(d['tmin'])}C)" for d in frost[:3]) + ".")
    else:
        parts.append(f"Sin heladas fuertes; minima {round(coldest['tmin'])}C." if coldest else "")
    if snow:
        parts.append("Nevada probable " + ", ".join(_d(d["date"]) for d in snow[:2]) + ".")
    parts.append("Sin lluvia." if rain < 2 else f"Lluvia {rain} mm en 7 dias.")
    if danger:
        parts.append("Encierre y abrigue crias esas noches.")
    parts.append("Oficial: SENAMHI.")
    sms = ascii_sms(" ".join(p for p in parts if p))

    # Radio / altavoz: frases completas, en orden.
    radio = [f"Pronóstico de PACHA-AGRO para {m['name']}, {m['department_name']}, para los próximos siete días."]
    for d in days:
        line = f"El {_d(d['date'], long=True)}: mínima de {round(d['tmin'])} grados" if d.get("tmin") is not None else f"El {_d(d['date'], long=True)}: sin dato de temperatura"
        if d.get("tmax") is not None:
            line += f" y máxima de {round(d['tmax'])}"
        if nights.get(d["date"], {}).get("snow"):
            line += "; posible nevada"
        elif (d.get("precip_mm") or 0) >= 2:
            line += f"; lluvia de unos {round(d['precip_mm'])} milímetros"
        lvl = nights.get(d["date"], {}).get("level")
        if lvl in ("alto", "extremo"):
            line += "; noche peligrosa para las crías"
        radio.append(line + ".")
    if danger:
        radio.append("En las noches peligrosas, encierre al rebaño al abrigo del viento, junte a las crías con sus madres y dé forraje seco al atardecer.")
    radio.append("Son estimaciones de modelos meteorológicos. Los avisos oficiales los publica el SENAMHI.")
    return {"available": True, "municipality": m["name"], "from": days[0]["date"], "to": days[-1]["date"],
            "sms": sms, "sms_parts": 1 if len(sms) <= 160 else 2 if len(sms) <= 306 else 3,
            "radio": " ".join(radio), "source": f.get("source"), "fetched_at": f.get("fetched_at")}
