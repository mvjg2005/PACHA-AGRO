"""Uywa · Ganado en riesgo: noches peligrosas, alerta temprana de año seco, forraje y pérdidas.

Nace de un caso real (comunidad Huayñacagua): ovejas sin corral techado, pastizales secos en invierno,
crías muertas por frío y por depredadores, y llamas muertas por nevadas en comunidades vecinas.

Todo usa datos reales o los de la propia comunidad:
  * Noches peligrosas: pronóstico (mínima, nieve, viento de la noche).
  * Año seco: lluvia de la temporada medida por satélite (NASA POWER, terciles desde 2001) + señas.
  * Pérdidas: reportes de las familias (solo se publican sumas, nunca nombres).
Los umbrales son orientativos y se explican en pantalla.
"""
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.time import local_today
from app.models import LivestockLoss
from app.services import senas
from app.services.weather import nasa_power

SNOW_CODES = {71, 73, 75, 77, 85, 86}
SPECIES = {"oveja": "Ovejas", "llama": "Llamas", "alpaca": "Alpacas", "vaca": "Vacas", "otro": "Otros"}
CAUSES = {"helada": "Helada o frío", "nevada": "Nevada", "hambre": "Hambre o sequía", "depredador": "Depredador (zorro, perros)",
          "enfermedad": "Enfermedad", "otro": "Otra causa"}
LEVELS = {"extremo": "Extremo", "alto": "Alto", "medio": "Medio", "bajo": "Bajo"}

ACTIONS = {
    "extremo": ["Encierre a todo el rebaño antes del atardecer en el lugar más protegido del viento.",
                "Junte a las madres con sus crías: el calor del grupo protege a los recién nacidos.",
                "Abrigue a las crías débiles (costales, mantas viejas) y revíselas en la madrugada.",
                "Dé forraje seco al atardecer: digerir alimento ayuda a producir calor en la noche."],
    "alto": ["Encierre al rebaño de noche al abrigo de un muro, una pirca o una ladera contra el viento.",
             "Separe a las crías recién nacidas y a los animales flacos en el lugar más abrigado.",
             "Dé forraje seco al atardecer."],
    "medio": ["Revise que las crías estén con sus madres y al abrigo del viento.",
              "Si hay animales flacos o recién paridos, encierrelos esta noche."],
    "bajo": ["Noche sin riesgo especial según el pronóstico."],
}

# Medidas de bajo costo para quien no tiene corral techado (orientación general).
NO_ROOF = [
    {"title": "Muro contra el viento (pirca o adobe)", "text": "Un muro de piedra o adobe de 1 a 1,5 m de alto, del lado de donde viene el viento frío, reduce mucho el frío que sienten los animales. Se puede levantar en minga con material del lugar."},
    {"title": "Dormidero en ladera o junto a la casa", "text": "Elija un lugar alto (no donde se junta el aire frío ni el agua), protegido del viento, con piso seco. Las hondonadas son las zonas más heladas."},
    {"title": "Cama seca", "text": "Paja, rastrojo o estiércol seco en el piso aíslan del suelo helado, sobre todo para las crías."},
    {"title": "Protección contra depredadores", "text": "Encierre de noche y revise el cerco. Las heridas en el cuello de las crías suelen indicar ataque de zorro o perros, no solo frío."},
    {"title": "Planificar las pariciones", "text": "Si las crías nacen en los meses más fríos y sin pasto (junio a agosto), mueren más. Consulte con un técnico cómo organizar el empadre para que las pariciones coincidan con épocas con más pasto."},
    {"title": "Pedir apoyo con datos", "text": "Con el informe de pérdidas de su comunidad (en esta página) puede solicitar a su municipio o gobernación apoyo para cobertizos y forraje."},
]


def _night_wind(hourly: list[dict] | None, day: str) -> float | None:
    """Viento máximo entre las 18:00 de `day` y las 07:00 del día siguiente."""
    if not hourly:
        return None
    nxt = (date.fromisoformat(day) + timedelta(days=1)).isoformat()
    vals = [h.get("wind_speed_10m") for h in hourly
            if (h["time"][:10] == day and h["time"][11:13] >= "18") or (h["time"][:10] == nxt and h["time"][11:13] <= "07")]
    vals = [v for v in vals if v is not None]
    return round(max(vals)) if vals else None


def night_level(tmin: float | None, snow: bool, wind: float | None) -> tuple[str, list[str]]:  # noqa: C901
    """Riesgo de la noche para crías y animales débiles (criterio orientativo)."""
    reasons = []
    if tmin is None:
        return "bajo", ["Sin dato de temperatura mínima."]
    if snow:
        reasons.append("nevada pronosticada")
    if tmin <= -2:
        reasons.append(f"mínima de {round(tmin)} °C")
    if wind is not None and wind >= 25 and tmin <= 0:
        reasons.append(f"viento de {wind} km/h en la noche")
    if tmin <= -10 or (snow and tmin <= -3):
        level = "extremo"
    elif tmin <= -6 or snow or (tmin <= -3 and wind is not None and wind >= 25):
        level = "alto"
    elif tmin <= -2:
        level = "medio"
    else:
        level = "bajo"
    return level, reasons


def nights(m: dict) -> dict:
    """Riesgo de las próximas noches para el ganado, con el pronóstico real del municipio."""
    from app.services.weather.service import _forecast
    key = (round(m["lat"], 2), round(m["lon"], 2))
    try:
        f = _forecast(m["lat"], m["lon"], key, altitude=m.get("elevation"))
    except Exception:  # noqa: BLE001 - el pronóstico no debe tumbar la página
        f = None
    if not f or not f.available:
        return {"available": False, "error": getattr(f, "error", None) or "Pronóstico no disponible ahora.", "nights": []}
    hourly = f.extra.get("hourly")
    out = []
    for d in f.daily[:7]:
        # Nevada: código de nieve del modelo, o precipitación con temperaturas bajo cero.
        snow = (d.weather_code in SNOW_CODES if d.weather_code is not None else False) or \
            ((d.precip_mm or 0) >= 5 and d.tmin is not None and d.tmin <= 0)
        wind = _night_wind(hourly, d.date)
        level, reasons = night_level(d.tmin, snow, wind)
        out.append({"date": d.date, "tmin": d.tmin, "snow": snow, "wind_kmh": wind, "level": level,
                    "label": LEVELS[level], "reasons": reasons, "actions": ACTIONS[level]})
    worst = min(out, key=lambda n: list(LEVELS).index(n["level"])) if out else None
    return {"available": True, "source": f.source, "nights": out, "worst": worst,
            "note": "Mínima a 2 m del suelo. A ras del suelo, donde duermen las crías, puede hacer 2 a 4 °C más frío."}


def _season_rain(daily: dict, start: date, end: date) -> float | None:
    days = [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]
    have = [daily[d][1] for d in days if d in daily and daily[d][1] is not None]
    return round(sum(have) * len(days) / len(have), 1) if len(have) >= 0.9 * len(days) else None


def drought(db: Session, m: dict, today: date | None = None) -> dict:
    """Alerta temprana de año seco: lluvia de la temporada (satélite) + lo que anuncian las señas."""
    today = today or local_today()
    c = senas.campaign_of(today)
    daily = senas._history(m, today)
    out: dict = {"campaign": c, "campaign_label": senas.campaign_label(c)}
    # 1. Lluvia desde el 1 de septiembre hasta la fecha, frente a la misma ventana de años anteriores.
    end = today - timedelta(days=senas.LAG_DAYS)
    start = date(c, 9, 1)
    if daily and end > start + timedelta(days=20):
        now = _season_rain(daily, start, end)
        past = [v for y in range(2001, c) if (v := _season_rain(daily, date(y, 9, 1), end.replace(year=end.year - (c - y)))) is not None]
        if now is not None and len(past) >= senas.MIN_YEARS:
            xs = sorted(past)
            lo, hi = xs[len(xs) // 3], xs[(2 * len(xs)) // 3]
            out["rain"] = {"observed": now, "normal": round(sum(past) / len(past), 1), "low": lo, "high": hi, "years": len(past),
                           "category": "seco" if now < lo else "lluvioso" if now > hi else "normal",
                           "window": f"{start.isoformat()} a {end.isoformat()}", "source": nasa_power.SOURCE}
    # 2. La temporada pasada, ya medida.
    prev = senas.outcome(m, c - 1, today, daily or {})
    if prev.get("lluvia", {}).get("status") == "evaluado":
        out["last_season"] = {**prev["lluvia"], "campaign_label": senas.campaign_label(c - 1)}
    # 3. Lo que dicen las señas de la zona para esta campaña.
    cons = senas.consensus(db, m["id"], c)
    votes = cons["department"]["votes"]["lluvia"]
    total = sum(votes.values())
    out["senas"] = {"n": cons["department"]["n"], "votes": votes,
                    "dry_share": round(votes["seco"] / total * 100) if total else None}
    # Nivel de alerta combinado
    signals = []
    if out.get("rain", {}).get("category") == "seco":
        signals.append("La lluvia de esta temporada va por debajo de lo normal según el satélite.")
    if out["senas"]["dry_share"] is not None and out["senas"]["dry_share"] >= 50 and out["senas"]["n"] >= 3:
        signals.append(f"El {out['senas']['dry_share']} % de las señas registradas en la zona anuncian año seco.")
    if out.get("last_season", {}).get("value") == "seco":
        signals.append(f"La temporada pasada ({out['last_season']['campaign_label']}) fue seca: el pasto y las reservas pueden estar bajos.")
    out["signals"] = signals
    out["level"] = "alta" if len(signals) >= 2 else "media" if signals else "baja"
    out["actions"] = {
        "alta": ["Calcule desde ahora cuánto forraje necesita para el invierno (calculadora de abajo).",
                 "Guarde forraje cuando haya: heno de cebada o avena, rastrojos, totora; en cosecha es más barato.",
                 "Considere vender o carnear antes del invierno los animales viejos o improductivos: quedan más pasto y forraje para el resto.",
                 "Converse con su comunidad para comprar forraje en conjunto y pedir apoyo al municipio con el informe de pérdidas."],
        "media": ["Revise cuánto forraje tiene guardado y para cuántos días alcanza.",
                  "Siga registrando las señas y revise esta alerta cada mes."],
        "baja": ["Por ahora no hay señales de año seco. Aproveche para guardar forraje para el invierno."],
    }[out["level"]]
    return out


def loss_out(x: LivestockLoss) -> dict:
    return {"id": x.id, "date": x.date, "species": x.species, "species_label": SPECIES[x.species], "count": x.count,
            "cause": x.cause, "cause_label": CAUSES[x.cause], "community": x.community_name, "notes": x.notes}


def _visible(q):
    return q if get_settings().seed_demo else q.where(LivestockLoss.is_demo.is_(False))


def summary(db: Session, municipality_id: str | None, department_id: str | None, c: int) -> dict:
    """Pérdidas de la campaña sumadas (nunca se publican nombres)."""
    q = select(LivestockLoss).where(LivestockLoss.campaign == c)
    if municipality_id:
        q = q.where(LivestockLoss.municipality_id == municipality_id)
    elif department_id:
        q = q.where(LivestockLoss.department_id == department_id)
    rows = db.scalars(_visible(q)).all()
    by_species, by_cause, by_month = Counter(), Counter(), Counter()
    communities = defaultdict(int)
    for r in rows:
        by_species[r.species] += r.count
        by_cause[r.cause] += r.count
        by_month[r.date[:7]] += r.count
        if r.community_name:
            communities[r.community_name.strip().title()] += r.count
    return {"campaign": c, "campaign_label": senas.campaign_label(c), "reports": len(rows), "families": len({r.user_id for r in rows}),
            "animals": sum(by_species.values()),
            "by_species": [{"id": k, "label": SPECIES[k], "count": v} for k, v in by_species.most_common()],
            "by_cause": [{"id": k, "label": CAUSES[k], "count": v} for k, v in by_cause.most_common()],
            "by_month": [{"month": k, "count": v} for k, v in sorted(by_month.items())],
            "communities": [{"name": k, "count": v} for k, v in sorted(communities.items(), key=lambda kv: -kv[1])],
            "has_demo": any(r.is_demo for r in rows)}


def winter_climate(m: dict, c: int, today: date | None = None) -> dict | None:
    """Invierno (junio a agosto) frente a los inviernos desde 2001 en el mismo lugar (satélite).
    Se compara contra su propio promedio porque el satélite promedia ~50 km y no capta el frío de la pampa."""
    today = today or local_today()
    daily = senas._history(m, today)
    if not daily:
        return None

    def stats(y: int):
        s0, e = date(y + 1, 6, 1), date(y + 1, 8, 31)
        vals = [daily.get((s0 + timedelta(days=i)).isoformat()) for i in range((e - s0).days + 1)]
        vals = [v for v in vals if v and v[0] is not None]
        if len(vals) < 80:
            return None
        return {"frost_nights": sum(1 for t, _ in vals if t < 0), "hard_nights": sum(1 for t, _ in vals if t <= -3),
                "min": round(min(t for t, _ in vals), 1), "rain_mm": round(sum(r or 0 for _, r in vals), 1)}
    # El invierno de la campaña c es junio–agosto del año c+1; si aún no llegó, se usa el anterior.
    y = c if stats(c) else c - 1
    cur = stats(y)
    if not cur:
        return None
    past = [p for k in range(2001, y) if (p := stats(k))]
    # Días con precipitación fuerte y helada: compatibles con nevada (el satélite no distingue lluvia de nieve).
    s0 = date(y + 1, 6, 1)
    events = []
    for i in range(92):
        k = (s0 + timedelta(days=i)).isoformat()
        v = daily.get(k)
        if v and v[0] is not None and v[1] is not None and v[1] >= 8 and v[0] <= 0:
            events.append({"date": k, "precip_mm": round(v[1], 1), "tmin": round(v[0], 1)})
    avg = lambda k: round(sum(p[k] for p in past) / len(past), 1) if past else None  # noqa: E731
    return {"winter": f"junio a agosto de {y + 1}", **cur, "snow_events": events,
            "normal_frost_nights": avg("frost_nights"), "normal_hard_nights": avg("hard_nights"), "normal_min": avg("min"),
            "normal_rain_mm": avg("rain_mm"),
            "years": len(past), "source": nasa_power.SOURCE,
            "note": "Satélite: mínima a 2 m promediada en ~50 km. En pampas y hondonadas, donde duerme el ganado, "
                    "las noches son varios grados más frías; sirve para comparar un invierno con otro."}


def report(db: Session, m: dict, c: int) -> dict:
    """Informe para autoridades: pérdidas de la comunidad + datos climáticos de la temporada."""
    out = {"generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
           "municipality": {"id": m["id"], "name": m["name"], "department_name": m["department_name"]},
           "losses": summary(db, m["id"], None, c), "rain": senas.outcome(m, c - 1, local_today()).get("lluvia"),
           "winter": winter_climate(m, c), "requests": [
               "Apoyo con forraje (heno, alimento balanceado) para la época seca.",
               "Materiales para cobertizos o dormideros (calamina, adobe, malla) para proteger a las crías.",
               "Asistencia veterinaria y técnica para planificar pariciones y sanidad del rebaño.",
           ]}
    out["rain_campaign_label"] = senas.campaign_label(c - 1)
    return out
