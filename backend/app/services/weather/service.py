"""Servicio meteorológico: combina fuentes, aplica caché y deriva riesgos simples."""
import json
import logging
import threading
import time
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone

import httpx

from app.services.weather import nasa_power, official, open_meteo
from app.services.weather.base import Block, DailyValue, ProviderError
from app.services.weather.simulated import simulated_forecast
from app.services.weather.spray import spray_conditions

OFFICIAL_ALERTS = {
    "available": False,
    "source": "SENAMHI Bolivia",
    "url": "https://senamhi.gob.bo",
    "message": "Los avisos oficiales de SENAMHI aún no están integrados (no se encontró una API pública documentada). "
               "Consulte los avisos oficiales en senamhi.gob.bo o en sus canales oficiales.",
}

_TTL = {"season": 86400, "official": 900, "forecast": 3600, "recent": 6 * 3600, "climatology": 30 * 86400, "error": 300}
# Antigüedad máxima de un dato guardado que se puede mostrar cuando el proveedor falla (indicando su hora).
_STALE_MAX = {"season": 30 * 86400, "official": 12 * 3600, "forecast": 12 * 3600, "recent": 3 * 86400, "climatology": 365 * 86400}
logger = logging.getLogger("agrobolivia.weather")


class _Cache:
    def __init__(self):
        self._data: dict = {}
        self._lock = threading.Lock()

    def get(self, key):
        with self._lock:
            item = self._data.get(key)
            if item and item[0] > time.monotonic():
                return item[1]
            return None

    def set(self, key, value, ttl):
        with self._lock:
            self._data[key] = (time.monotonic() + ttl, value)

    def clear(self):
        with self._lock:
            self._data.clear()


cache = _Cache()
_client: httpx.Client | None = None


def get_client() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(headers={"User-Agent": "AgroBolivia-prototipo/0.1"})
    return _client


def set_client(client: httpx.Client | None) -> None:
    """Permite inyectar un cliente simulado en pruebas. Cambiar de fuente vacía ambas cachés."""
    global _client
    _client = client
    clear_cache()


def clear_cache() -> None:
    from app import db as dbmod
    from app.models import WeatherCache
    cache.clear()
    try:
        with dbmod.SessionLocal() as s:
            s.query(WeatherCache).delete()
            s.commit()
    except Exception:  # noqa: BLE001
        pass


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _dump(value) -> str:
    if isinstance(value, Block):
        return json.dumps({"_t": "block", "v": value.to_dict()})
    return json.dumps({"_t": "dict", "v": value})


def _load(raw: str):
    d = json.loads(raw)
    if d["_t"] == "block":
        v = d["v"]
        return Block(**{**v, "daily": [DailyValue(**x) for x in v["daily"]]})
    return d["v"]


def _db_get(dbkey: str):
    """Lee la caché persistente. Cualquier error de base de datos se ignora: el clima nunca debe romperse por la caché."""
    from app import db as dbmod
    from app.models import WeatherCache
    try:
        with dbmod.SessionLocal() as s:
            row = s.get(WeatherCache, dbkey)
            return (_load(row.payload), row.fetched_at, row.expires_at) if row else None
    except Exception:  # noqa: BLE001
        logger.warning("No se pudo leer la caché persistente del clima", exc_info=True)
        return None


def _db_set(dbkey: str, value, ttl: int) -> None:
    from app import db as dbmod
    from app.models import WeatherCache
    try:
        with dbmod.SessionLocal() as s:
            now = _now()
            row = s.get(WeatherCache, dbkey) or WeatherCache(key=dbkey)
            row.payload, row.fetched_at, row.expires_at = _dump(value), now, now + timedelta(seconds=ttl)
            s.merge(row)
            s.commit()
    except Exception:  # noqa: BLE001
        logger.warning("No se pudo guardar la caché persistente del clima", exc_info=True)


def _cached(kind: str, key: tuple, fn):
    """Memoria → base de datos (vigente) → proveedor → último dato guardado (marcado como desactualizado)."""
    ck = (kind, *key)
    hit = cache.get(ck)
    if hit is not None:
        return hit
    dbkey = f"{kind}:{key[0]:.2f},{key[1]:.2f}" + "".join(f":{k}" for k in key[2:])
    stored = _db_get(dbkey)
    if stored and stored[2] > _now():
        cache.set(ck, stored[0], max(1, int((stored[2] - _now()).total_seconds())))
        return stored[0]
    try:
        value = fn()
    except ProviderError as e:
        if stored and isinstance(stored[0], (Block, dict)) and _now() - stored[1] <= timedelta(seconds=_STALE_MAX[kind]):
            old = stored[0]
            info = {"stale": True, "stale_fetched_at": stored[1].isoformat(timespec="minutes") + "Z", "error_now": str(e)}
            value = replace(old, extra={**old.extra, **info}) if isinstance(old, Block) else {**old, **info}
        else:
            value = {"_error": str(e)}
        cache.set(ck, value, _TTL["error"])
        return value
    cache.set(ck, value, _TTL[kind])
    _db_set(dbkey, value, _TTL[kind])
    return value


def _forecast(lat: float, lon: float, key: tuple) -> Block:
    """Fuente oficial primero (si está configurada); si falla, Open-Meteo. Los errores quedan registrados."""
    from app.core.config import get_settings

    errors = []
    if get_settings().official_weather_url:
        o = _cached("official", key, lambda: official.fetch_official(lat, lon, get_client()))
        if isinstance(o, Block):
            return o
        errors.append(o["_error"])
    f = _cached("forecast", key, lambda: open_meteo.fetch_forecast(lat, lon, get_client()))
    if isinstance(f, Block) and f.extra.get("stale"):
        today = date.today().isoformat()
        f = replace(f, daily=[d for d in f.daily if d.date >= today])
        if not f.daily:
            return Block(available=False, source=open_meteo.SOURCE, kind="pronostico", error=f.extra["error_now"])
    if isinstance(f, Block):
        if errors:
            f.extra = {**f.extra, "fallback_from": errors}
        return f
    errors.append(f["_error"])
    return Block(available=False, source=open_meteo.SOURCE, kind="pronostico", error=" ".join(errors))


def get_weather(municipality: dict, mode: str = "real", today: date | None = None) -> dict:
    lat, lon = municipality["lat"], municipality["lon"]
    key = (round(lat, 2), round(lon, 2))

    if mode == "simulado":
        forecast = simulated_forecast(municipality, today)
        recent = Block(available=False, source="—", kind="simulado", error="No se usa en modo simulado.")
        clim = {"available": False}
    else:
        forecast = _forecast(lat, lon, key)
        r = _cached("recent", key, lambda: nasa_power.fetch_recent(lat, lon, get_client(), today))
        recent = r if isinstance(r, Block) else Block(available=False, source=nasa_power.SOURCE, kind="estimacion", error=r["_error"])
        c = _cached("climatology", key, lambda: nasa_power.fetch_climatology(lat, lon, get_client()))
        clim = c if "_error" not in c else {"available": False, "error": c["_error"]}

    month = (today or date.today()).month
    return {
        "mode": mode,
        "location": {**{k: municipality[k] for k in ("id", "name", "department_id", "department_name", "lat", "lon", "elevation", "region")},
                     **{k: municipality[k] for k in ("gps", "nearest_name", "distance_km", "far") if k in municipality}},
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "forecast": _public(forecast),
        "recent": recent.to_dict(),
        "climatology": _clim_summary(clim, month),
        "official_alerts": OFFICIAL_ALERTS,
        "frost_risk": frost_risk(forecast, clim, month),
        "storm_risk": storm_risk(forecast),
        "spray": spray_conditions(forecast.extra.get("hourly")) if forecast.available and mode != "simulado" else None,
    }


def _public(block: Block) -> dict:
    d = block.to_dict()
    d["extra"] = {k: v for k, v in d["extra"].items() if k != "hourly"}  # la serie por hora solo se usa en el servidor
    return d


def _clim_summary(clim: dict, month: int) -> dict:
    if not clim.get("available"):
        return {"available": False, "error": clim.get("error")}
    m = nasa_power.MONTHS[month - 1]
    return {
        "available": True, "source": clim["source"], "kind": "climatologia", "period": clim["period"],
        "month": m, "frost_days_month": clim["frost_days"].get(m), "precip_mm_day_month": clim["precip_mm_day"].get(m),
    }


def frost_risk(forecast: Block, clim: dict, month: int) -> dict:
    """Riesgo de helada orientativo con la temperatura mínima pronosticada a 2 m.
    A ras del suelo la helada puede ser 2-4 °C más fuerte que el valor a 2 m."""
    if forecast.available:
        mins = [(d.tmin, d.date) for d in forecast.daily if d.tmin is not None]
        if mins:
            tmin, day = min(mins)
            level = "alto" if tmin <= -2 else "medio" if tmin <= 1 else "bajo"
            return {"level": level, "min_tmin": tmin, "date": day, "basis": "pronostico", "source": forecast.source}
    if clim.get("available"):
        fd = clim["frost_days"].get(nasa_power.MONTHS[month - 1])
        if fd is not None:
            level = "alto" if fd >= 10 else "medio" if fd >= 2 else "bajo"
            return {"level": level, "min_tmin": None, "date": None, "basis": "climatologia",
                    "frost_days_month": fd, "source": "NASA POWER (climatología)"}
    return {"level": "desconocido", "basis": None, "source": None}


def storm_risk(forecast: Block) -> dict:
    if not forecast.available:
        return {"level": "desconocido", "days": []}
    days = [d.date for d in forecast.daily if d.storm]
    return {
        "level": "posible" if days else "no_pronosticado", "days": days,
        "note": "Los modelos indican tormentas eléctricas; el granizo es posible pero no se pronostica de forma fiable en Bolivia."
        if days else "No se pronostican tormentas. El granizo puede ocurrir igual de forma local.",
    }


def get_history(municipality: dict, today: date | None = None) -> dict:
    """Serie diaria de lluvia y mínima desde 2001 (NASA POWER) para un municipio. Una sola consulta,
    con caché persistente de un día: sirve para el Pachagrama y para evaluar las señas."""
    lat, lon = municipality["lat"], municipality["lon"]
    end = (today or date.today()) - timedelta(days=5)
    return _cached("season", (round(lat, 2), round(lon, 2), "historia"),
                   lambda: nasa_power.fetch_range(lat, lon, date(2001, 1, 1), end, get_client()))
