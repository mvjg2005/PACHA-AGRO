"""NASA POWER: datos diarios recientes (reanálisis MERRA-2/GEOS, resolución ~0,5°) y climatología.
Gratuito y sin clave. Los datos diarios tienen un retraso de varios días. https://power.larc.nasa.gov
"""
from datetime import date, datetime, timedelta, timezone

import httpx

from app.core.config import get_settings
from app.core.time import local_today
from app.services.weather.base import Block, DailyValue, ProviderError

SOURCE = "NASA POWER (reanálisis satelital, ~50 km de resolución)"
FILL = -999.0
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def _get(client: httpx.Client, url: str, params: dict) -> dict:
    s = get_settings()
    try:
        r = client.get(url, params=params, timeout=s.weather_timeout_seconds * 2)
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise ProviderError(f"No se pudo obtener datos de NASA POWER ({type(e).__name__}).") from e
    if r.status_code != 200:
        raise ProviderError(f"NASA POWER no entregó datos ({r.status_code}).")
    if not isinstance(data, dict) or "properties" not in data:
        raise ProviderError("NASA POWER respondió con un formato inesperado.")
    return data


def fetch_recent(lat: float, lon: float, client: httpx.Client, today: date | None = None) -> Block:
    today = today or local_today()
    start = today - timedelta(days=14)
    data = _get(client, f"{get_settings().nasa_power_url}/daily/point", {
        "parameters": "T2M_MIN,T2M_MAX,PRECTOTCORR,GWETTOP",
        "community": "AG", "latitude": lat, "longitude": lon,
        "start": start.strftime("%Y%m%d"), "end": today.strftime("%Y%m%d"), "format": "JSON",
    })
    return parse_recent(data)


def _parameters(data: dict) -> dict:
    props = data.get("properties") if isinstance(data, dict) else None
    p = props.get("parameter") if isinstance(props, dict) else None
    if not isinstance(p, dict) or not p:
        raise ProviderError("NASA POWER respondió con un formato inesperado.")
    return p


def parse_recent(data: dict) -> Block:
    p = _parameters(data)
    tmin, tmax, pr, gw = p.get("T2M_MIN", {}), p.get("T2M_MAX", {}), p.get("PRECTOTCORR", {}), p.get("GWETTOP", {})
    if not isinstance(tmin, dict) or not tmin:
        raise ProviderError("NASA POWER no incluyó temperaturas diarias.")
    daily, last_gw = [], None
    for k in sorted(tmin):
        if tmin[k] == FILL:
            continue  # día aún no disponible (retraso habitual de NASA POWER)
        daily.append(DailyValue(date=f"{k[:4]}-{k[4:6]}-{k[6:]}", tmin=tmin[k], tmax=_v(tmax.get(k)), precip_mm=_v(pr.get(k))))
        if _v(gw.get(k)) is not None:
            last_gw = gw[k]
    daily = daily[-7:]
    if not daily:
        raise ProviderError("NASA POWER aún no tiene datos de los últimos días.")
    geometry = data.get("geometry") if isinstance(data.get("geometry"), dict) else {}
    coords = geometry.get("coordinates")
    elevation = coords[2] if isinstance(coords, list) and len(coords) > 2 else None
    return Block(
        available=True, source=SOURCE, kind="estimacion",
        fetched_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        daily=daily, soil_moisture=last_gw,
        soil_moisture_unit="índice 0-1 (modelo, capa superficial)" if last_gw is not None else None,
        extra={"last_date": daily[-1].date, "grid_elevation_m": elevation},
    )


def fetch_climatology(lat: float, lon: float, client: httpx.Client) -> dict:
    data = _get(client, f"{get_settings().nasa_power_url}/climatology/point", {
        "parameters": "T2M_MIN,PRECTOTCORR,FROST_DAYS", "community": "AG",
        "latitude": lat, "longitude": lon, "format": "JSON",
    })
    return parse_climatology(data)


def parse_climatology(data: dict) -> dict:
    p = _parameters(data)
    header = data.get("header") if isinstance(data.get("header"), dict) else {}
    return {
        "available": True, "source": "NASA POWER (climatología)", "kind": "climatologia",
        "period": header.get("range", ""),
        # NASA usa -999 para "sin dato"; no debe llegar a la interfaz como un valor real.
        "frost_days": {m: _v(p.get("FROST_DAYS", {}).get(m)) for m in MONTHS},
        "precip_mm_day": {m: _v(p.get("PRECTOTCORR", {}).get(m)) for m in MONTHS},
    }


def fetch_range(lat: float, lon: float, start: date, end: date, client: httpx.Client) -> dict:
    """Lluvia y temperatura mínima diarias de un periodo (para evaluar una campaña agrícola)."""
    data = _get(client, f"{get_settings().nasa_power_url}/daily/point", {
        "parameters": "T2M_MIN,PRECTOTCORR", "community": "AG", "latitude": lat, "longitude": lon,
        "start": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d"), "format": "JSON",
    })
    return parse_range(data)


def parse_range(data: dict) -> dict:
    p = data["properties"]["parameter"]
    tmin, pr = p.get("T2M_MIN", {}), p.get("PRECTOTCORR", {})
    out = {}
    for k in sorted(tmin):
        t, r = _v(tmin.get(k)), _v(pr.get(k))
        if t is None and r is None:
            continue
        out[f"{k[:4]}-{k[4:6]}-{k[6:]}"] = [t, r]
    if not out:
        raise ProviderError("NASA POWER no tiene datos para ese periodo.")
    return {"source": SOURCE, "daily": out}


def _v(x):
    return None if x is None or x == FILL else x
