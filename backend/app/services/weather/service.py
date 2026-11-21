"""Servicio meteorológico: combina fuentes, aplica caché y deriva riesgos simples."""
import threading
import time
from datetime import date, datetime, timezone

import httpx

from app.core.time import local_today
from app.services.weather import nasa_power, official, open_meteo
from app.services.weather.base import Block, ProviderError
from app.services.weather.simulated import simulated_forecast

OFFICIAL_ALERTS = {
    "available": False,
    "source": "SENAMHI Bolivia",
    "url": "https://senamhi.gob.bo",
    "message": "Los avisos oficiales de SENAMHI aún no están integrados (no se encontró una API pública documentada). "
               "Consulte los avisos oficiales en senamhi.gob.bo o en sus canales oficiales.",
}

_TTL = {"official": 900, "forecast": 3600, "recent": 6 * 3600, "climatology": 30 * 86400, "error": 300}


class _Cache:
    def __init__(self):
        self._data: dict = {}
        self._lock = threading.Lock()
        self._writes = 0
        self._max_entries = 512

    def get(self, key):
        with self._lock:
            item = self._data.get(key)
            if item and item[0] > time.monotonic():
                return item[1]
            if item:
                self._data.pop(key, None)
            return None

    def set(self, key, value, ttl):
        now = time.monotonic()
        with self._lock:
            self._writes += 1
            # Los cachés diarios crean claves nuevas; retira expiradas y mantiene un máximo.
            if self._writes % 100 == 0 or len(self._data) >= self._max_entries:
                for old_key, item in list(self._data.items()):
                    if item[0] <= now:
                        self._data.pop(old_key, None)
            if len(self._data) >= self._max_entries and key not in self._data:
                oldest = min(self._data, key=lambda k: self._data[k][0])
                self._data.pop(oldest, None)
            self._data[key] = (now + ttl, value)

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
    """Permite inyectar un cliente simulado en pruebas."""
    global _client
    _client = client
    cache.clear()


def _cached(kind: str, key: tuple, fn):
    ck = (kind, *key)
    hit = cache.get(ck)
    if hit is not None:
        return hit
    try:
        value = fn()
        cache.set(ck, value, _TTL[kind])
    except ProviderError as e:
        value = {"_error": str(e)}
        cache.set(ck, value, _TTL["error"])
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
    if isinstance(f, Block):
        if errors:
            f.extra = {**f.extra, "fallback_from": errors}
        return f
    errors.append(f["_error"])
    return Block(available=False, source=open_meteo.SOURCE, kind="pronostico", error=" ".join(errors))


def get_weather(municipality: dict, mode: str = "real", today: date | None = None) -> dict:
    today = today or local_today()
    lat, lon = municipality["lat"], municipality["lon"]
    key = (round(lat, 2), round(lon, 2))

    if mode == "simulado":
        forecast = simulated_forecast(municipality, today)
        recent = Block(available=False, source="—", kind="simulado", error="No se usa en modo simulado.")
        clim = {"available": False}
    else:
        forecast = _forecast(lat, lon, key)
        r = _cached("recent", (*key, today.isoformat()), lambda: nasa_power.fetch_recent(lat, lon, get_client(), today))
        recent = r if isinstance(r, Block) else Block(available=False, source=nasa_power.SOURCE, kind="estimacion", error=r["_error"])
        c = _cached("climatology", key, lambda: nasa_power.fetch_climatology(lat, lon, get_client()))
        clim = c if "_error" not in c else {"available": False, "error": c["_error"]}

    month = today.month
    return {
        "mode": mode,
        "location": {k: municipality[k] for k in ("id", "name", "department_id", "department_name", "lat", "lon", "elevation", "region")},
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "forecast": forecast.to_dict(),
        "recent": recent.to_dict(),
        "climatology": _clim_summary(clim, month),
        "official_alerts": OFFICIAL_ALERTS,
        "frost_risk": frost_risk(forecast, clim, month),
        "storm_risk": storm_risk(forecast),
    }


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
