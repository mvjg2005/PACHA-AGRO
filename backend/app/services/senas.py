"""Señas andinas medidas con datos: saber local + satélite.

Cada seña registrada es un pronóstico local para la campaña agrícola (julio a junio). Al terminar la
temporada se compara con lo que midió NASA POWER en ese municipio, por TERCILES (método usual de los
pronósticos estacionales): la temporada se ordena junto a todas las demás desde 2001 y cae en el tercio
bajo, medio o alto.
  * Lluvia: total de noviembre a marzo  -> seco | normal | lluvioso.
  * Heladas tempranas: días con mínima < 0 °C de septiembre a noviembre -> pocas | normal | muchas.
Por construcción, adivinar al azar acierta 1 de cada 3 veces: esa es la vara para medir cada seña.
"""
import json
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.data.catalog import get_municipality
from app.models import Community, Observation, SenaObservation
from app.services.textnorm import normalize
from app.services.weather import nasa_power

LAG_DAYS = 7  # retraso habitual de NASA POWER
MIN_YEARS = 10
MONTHS_ES = ["jul", "ago", "sep", "oct", "nov", "dic", "ene", "feb", "mar", "abr", "may", "jun"]


@lru_cache
def catalog() -> dict:
    return json.loads((Path(__file__).resolve().parent.parent / "data" / "senas.json").read_text(encoding="utf-8"))


def sena(sena_id: str) -> dict | None:
    return next((s for s in catalog()["senas"] if s["id"] == sena_id), None)


def reading(sena_id: str, reading_id: str) -> dict | None:
    s = sena(sena_id)
    return next((r for r in s["readings"] if r["id"] == reading_id), None) if s else None


def campaign_of(d: date) -> int:
    return d.year if d.month >= 7 else d.year - 1


def campaign_label(c: int) -> str:
    return f"{c}–{c + 1}"


def windows(c: int) -> dict:
    return {"lluvia": (date(c, 11, 1), date(c + 1, 3, 31)), "helada": (date(c, 9, 1), date(c, 11, 30))}


def _days_in(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def _history(m: dict, today: date) -> dict | None:
    from app.services.weather.service import get_history
    h = get_history(m, today)
    return None if "_error" in h else h["daily"]


def _metric(daily: dict, k: str, c: int) -> float | None:
    """Valor del indicador `k` en la campaña `c`, o None si faltan más del 10 % de los días."""
    start, end = windows(c)[k]
    days = [d.isoformat() for d in _days_in(start, end)]
    have = [daily[d] for d in days if d in daily]
    if len(have) < 0.9 * len(days):
        return None
    if k == "lluvia":
        return round(sum(r for _, r in have if r is not None) * len(days) / len(have), 1)
    return round(sum(1 for t, _ in have if t is not None and t < 0) * len(days) / len(have), 1)


def _tercile(value: float, others: list[float]) -> tuple[float, float]:
    xs = sorted(others)
    q = lambda p: xs[min(len(xs) - 1, max(0, round(p * (len(xs) - 1))))]  # noqa: E731
    return q(1 / 3), q(2 / 3)


def outcome(m: dict, c: int, today: date | None = None, daily: dict | None = None) -> dict:
    """Qué pasó en la campaña `c` en el municipio `m`, por indicador. Estados: pendiente | evaluado | sin_datos."""
    today = today or date.today()
    win = windows(c)
    ready = {k: today - timedelta(days=LAG_DAYS) > end for k, (_, end) in win.items()}
    pending = {k: {"status": "pendiente", "available_after": (end + timedelta(days=LAG_DAYS + 1)).isoformat()} for k, (_, end) in win.items()}
    if not any(ready.values()):
        return pending
    daily = daily if daily is not None else _history(m, today)
    labels = catalog()["outcomes"]
    out = {}
    for k in win:
        if not ready[k]:
            out[k] = pending[k]
            continue
        value = _metric(daily, k, c) if daily else None
        others = [v for y in range(2001, campaign_of(today) + 1) if y != c and today - timedelta(days=LAG_DAYS) > win[k][1].replace(year=win[k][1].year - c + y)
                  and (v := _metric(daily, k, y)) is not None] if daily else []
        if value is None or len(others) < MIN_YEARS:
            out[k] = {"status": "sin_datos"}
            continue
        lo, hi = _tercile(value, others)
        cat = ("seco" if value < lo else "lluvioso" if value > hi else "normal") if k == "lluvia" \
            else ("pocas" if value < lo else "muchas" if value > hi else "normal")
        unit = "mm" if k == "lluvia" else "días"
        out[k] = {"status": "evaluado", "value": cat, "label": labels[k]["values"][cat], "observed": value, "unit": unit,
                  "normal": round(sum(others) / len(others), 1), "low": lo, "high": hi, "years": len(others),
                  "window": f"{win[k][0].isoformat()} a {win[k][1].isoformat()}", "source": nasa_power.SOURCE}
    return out


def _visible(q):
    return q if get_settings().seed_demo else q.where(SenaObservation.is_demo.is_(False))


def obs_out(o: SenaObservation, mine: bool = False) -> dict:
    s, r = sena(o.sena_id), reading(o.sena_id, o.reading)
    return {"id": o.id, "sena_id": o.sena_id, "sena_name": o.custom_name if o.sena_id == "otra" and o.custom_name else (s["name"] if s else o.sena_id),
            "reading": o.reading, "reading_label": r["label"] if r else o.reading, "predicts": r["predicts"] if r else {},
            "observed_on": o.observed_on, "campaign": o.campaign, "municipality_id": o.municipality_id,
            "notes": o.notes if mine else "", "is_demo": o.is_demo, "mine": mine}


def consensus(db: Session, municipality_id: str, c: int) -> dict:
    """Lo que dicen las señas registradas para una campaña, en el municipio y en todo el departamento."""
    m = get_municipality(municipality_id)
    rows = db.scalars(_visible(select(SenaObservation).where(SenaObservation.campaign == c,
                                                              SenaObservation.department_id == m["department_id"]))).all()

    def count(items):
        votes = {"lluvia": {"lluvioso": 0, "normal": 0, "seco": 0}, "helada": {"muchas": 0, "normal": 0, "pocas": 0}}
        for o in items:
            r = reading(o.sena_id, o.reading)
            for k, vals in (r or {}).get("predicts", {}).items():
                for v in vals:  # una seña que anuncia «normal o lluvioso» suma medio voto a cada uno
                    votes[k][v] += 1 / len(vals)
        return {k: {v: round(n, 1) for v, n in d.items()} for k, d in votes.items()}
    local = [o for o in rows if o.municipality_id == municipality_id]
    return {"local": {"n": len(local), "votes": count(local)}, "department": {"n": len(rows), "votes": count(rows)},
            "recent": [obs_out(o) for o in sorted(local, key=lambda o: o.observed_on, reverse=True)[:12]]}


def reliability(db: Session, department_id: str | None, today: date | None = None) -> dict:
    """Acierto de cada seña en campañas ya evaluadas, comparado con el acierto esperado por azar."""
    today = today or date.today()
    q = select(SenaObservation)
    if department_id:
        q = q.where(SenaObservation.department_id == department_id)
    rows = db.scalars(_visible(q)).all()
    outcomes: dict[tuple, dict] = {}
    groups: dict[str, dict] = {}
    for o in rows:
        r = reading(o.sena_id, o.reading)
        if not r:
            continue
        key = (o.municipality_id, o.campaign)
        if key not in outcomes:
            m = get_municipality(o.municipality_id)
            outcomes[key] = outcome(m, o.campaign, today) if m else {}
        gid = o.sena_id if o.sena_id != "otra" else f"otra:{normalize(o.custom_name) or 'sin nombre'}"
        s = sena(o.sena_id)
        g = groups.setdefault(gid, {"id": gid, "sena_id": o.sena_id, "name": o.custom_name if o.sena_id == "otra" else s["name"],
                                    "observations": 0, "demo": 0, "evaluated": 0, "hits": 0, "chance_sum": 0.0, "campaigns": set()})
        g["observations"] += 1
        g["demo"] += o.is_demo
        for k, vals in r["predicts"].items():
            res = outcomes[key].get(k, {})
            if res.get("status") != "evaluado":
                continue
            g["evaluated"] += 1
            g["hits"] += res["value"] in vals
            g["chance_sum"] += len(vals) / 3
            g["campaigns"].add(o.campaign)
    out = []
    for g in groups.values():
        n = g["evaluated"]
        out.append({k: v for k, v in g.items() if k not in ("chance_sum", "campaigns")} | {
            "rate": round(g["hits"] / n * 100) if n else None,
            "chance": round(g["chance_sum"] / n * 100) if n else None,
            "campaigns": sorted(campaign_label(c) for c in g["campaigns"]),
            "enough": n >= 5})
    out.sort(key=lambda x: (-(x["evaluated"]), x["name"]))
    return {"department_id": department_id, "senas": out, "method": catalog()["method"],
            "note": "Con menos de 5 observaciones evaluadas, el porcentaje todavía no dice mucho."}


def pachagrama(db: Session, municipality_id: str, c: int, today: date | None = None) -> dict:
    """Calendario vivo de la campaña: lluvia y heladas por semana (satélite), promedio histórico,
    reportes de la comunidad y señas registradas."""
    today = today or date.today()
    m = get_municipality(municipality_id)
    daily = _history(m, today)
    start = date(c, 7, 1)

    def week_vals(c0: int, w: int):
        ws0 = date(c0, 7, 1) + timedelta(days=7 * w)
        return [v for i in range(7) if (v := daily.get((ws0 + timedelta(days=i)).isoformat()))]
    weeks = []
    for w in range(52):
        ws = start + timedelta(days=7 * w)
        we = ws + timedelta(days=6)
        rain = frost = tmin = None
        normal = None
        if daily:
            vals = week_vals(c, w)
            if vals:
                rain = round(sum(r for _, r in vals if r is not None), 1)
                frost = sum(1 for t, _ in vals if t is not None and t < 0)
                ts = [t for t, _ in vals if t is not None]
                tmin = round(min(ts), 1) if ts else None
            past = [sum(r for _, r in vv if r is not None) for y in range(2001, campaign_of(today) + 1) if y != c and len(vv := week_vals(y, w)) == 7]
            normal = round(sum(past) / len(past), 1) if len(past) >= MIN_YEARS else None
        weeks.append({"start": ws.isoformat(), "end": we.isoformat(), "rain_mm": rain, "normal_mm": normal,
                      "frost_days": frost, "tmin": tmin, "future": ws > today, "reports": {}, "senas": []})
    # Reportes comunitarios (solo conteos; sin nombres ni textos)
    comm_ids = [cid for (cid,) in db.execute(select(Community.id).where(Community.municipality_id == municipality_id))]
    if comm_ids:
        for o in db.scalars(select(Observation).where(Observation.community_id.in_(comm_ids), Observation.review_status != "descartada")):
            idx = (o.observed_at.date() - start).days // 7
            if 0 <= idx < 52:
                weeks[idx]["reports"][o.kind] = weeks[idx]["reports"].get(o.kind, 0) + 1
    for o in db.scalars(_visible(select(SenaObservation).where(SenaObservation.municipality_id == municipality_id, SenaObservation.campaign == c))):
        idx = (date.fromisoformat(o.observed_on) - start).days // 7
        if 0 <= idx < 52:
            weeks[idx]["senas"].append(obs_out(o)["sena_name"])
    return {"municipality": {"id": m["id"], "name": m["name"], "department_name": m["department_name"]},
            "campaign": c, "campaign_label": campaign_label(c), "months": MONTHS_ES, "weeks": weeks,
            "data_available": bool(daily), "outcome": outcome(m, c, today, daily) if daily else outcome(m, c, today, {}),
            "source": nasa_power.SOURCE,
            "note": "Lluvia y heladas estimadas por satélite (~50 km). La línea muestra el promedio de esa semana desde 2001."}
