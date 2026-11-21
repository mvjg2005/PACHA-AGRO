"""Open-Meteo: pronóstico gratuito sin clave para uso no comercial (CC BY 4.0, ~10 000 llamadas/día).
Para uso comercial se requiere un plan pagado. Documentación: https://open-meteo.com/en/docs
"""
from datetime import datetime, timezone

import httpx

from app.core.config import get_settings
from app.services.weather.base import STORM_CODES, Block, DailyValue, ProviderError
from app.services.weather.spray import hourly_series

SOURCE = "Open-Meteo (modelos meteorológicos globales)"


def fetch_forecast(lat: float, lon: float, client: httpx.Client) -> Block:
    s = get_settings()
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,weather_code",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code",
        "hourly": "soil_moisture_3_to_9cm,temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,precipitation,precipitation_probability",
        "timezone": "America/La_Paz",
        "forecast_days": 7,
    }
    url = s.open_meteo_url
    if s.open_meteo_api_key:
        # Plan pagado (uso comercial o más consultas): otro dominio y la clave como parámetro.
        url = url.replace("://api.open-meteo.com", "://customer-api.open-meteo.com")
        params["apikey"] = s.open_meteo_api_key
    try:
        r = client.get(url, params=params, timeout=s.weather_timeout_seconds)
    except httpx.HTTPError as e:
        raise ProviderError(f"No se pudo conectar con Open-Meteo ({type(e).__name__}).") from e
    try:
        data = r.json()
    except ValueError as e:
        raise ProviderError("Open-Meteo respondió con un formato inesperado.") from e
    if r.status_code != 200 or data.get("error"):
        reason = str(data.get("reason", r.status_code))
        if "limit" in reason.lower() or r.status_code == 429:
            raise ProviderError("El servicio de pronóstico (Open-Meteo) alcanzó su límite de consultas por hoy.")
        raise ProviderError(f"El servicio de pronóstico (Open-Meteo) no entregó datos ({r.status_code}).")
    return parse_forecast(data)


def parse_forecast(data: dict) -> Block:
    d = data.get("daily") or {}
    dates = d.get("time") or []
    if not dates:
        raise ProviderError("Open-Meteo no incluyó pronóstico diario.")
    daily = []
    for i, day in enumerate(dates):
        code = _at(d.get("weather_code"), i)
        daily.append(DailyValue(
            date=day,
            tmin=_at(d.get("temperature_2m_min"), i),
            tmax=_at(d.get("temperature_2m_max"), i),
            precip_mm=_at(d.get("precipitation_sum"), i),
            precip_prob=_at(d.get("precipitation_probability_max"), i),
            weather_code=int(code) if code is not None else None,
            storm=code in STORM_CODES if code is not None else False,
        ))
    soil = None
    hourly = data.get("hourly") or {}
    sm = [v for v in (hourly.get("soil_moisture_3_to_9cm") or [])[:24] if v is not None]
    if sm:
        soil = round(sum(sm) / len(sm), 3)
    cur = data.get("current") or {}
    return Block(
        available=True,
        source=SOURCE,
        kind="pronostico",
        fetched_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        daily=daily,
        current_temp=cur.get("temperature_2m"),
        current_time=cur.get("time"),
        soil_moisture=soil,
        soil_moisture_unit="m3/m3 (modelo, 3-9 cm)" if soil is not None else None,
        extra={"grid_elevation_m": data.get("elevation"), "license": "CC BY 4.0 — datos de Open-Meteo.com",
               "hourly": hourly_series(hourly)},
    )


def _at(arr, i):
    if not arr or i >= len(arr):
        return None
    return arr[i]
