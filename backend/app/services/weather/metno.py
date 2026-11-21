"""MET Norway (Locationforecast 2.0): pronóstico global gratuito y sin clave.

Se usa como respaldo cuando Open-Meteo alcanza su límite diario (frecuente en IP compartidas
como las de Render). La API pide identificarse con un User-Agent propio; los datos son
© Norwegian Meteorological Institute y se publican con licencia CC BY 4.0.
Documentación: https://api.met.no/weatherapi/locationforecast/2.0/documentation
"""
from datetime import date, datetime, timedelta, timezone

import httpx

from app.core.config import get_settings
from app.core.time import BOLIVIA_TZ, local_now, local_today
from app.services.weather.base import STORM_CODES, Block, DailyValue, ProviderError

URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact"
SOURCE = "MET Norway (Locationforecast 2.0)"
USER_AGENT = "AgroBolivia/0.1 (https://github.com/Z0M3I/PACHA-AGRO)"
LICENSE = "© Norwegian Meteorological Institute (MET Norway) — CC BY 4.0"


def fetch_forecast(lat: float, lon: float, client: httpx.Client, today: date | None = None,
                   altitude: float | None = None) -> Block:
    s = get_settings()
    params = {"lat": lat, "lon": lon}
    # MET Norway ajusta la temperatura a la altitud indicada; sin ella usa una topografía gruesa.
    if altitude is not None:
        params["altitude"] = altitude
    try:
        r = client.get(
            URL,
            params=params,
            headers={"User-Agent": USER_AGENT},
            timeout=s.weather_timeout_seconds,
        )
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise ProviderError(f"No se pudo obtener el pronóstico de MET Norway ({type(e).__name__}).") from e
    if r.status_code != 200:
        raise ProviderError(f"MET Norway no entregó datos ({r.status_code}).")
    return parse_forecast(data, today)


def parse_forecast(data: dict, today: date | None = None) -> Block:
    if not isinstance(data, dict):
        raise ProviderError("MET Norway respondió con un formato inesperado.")
    properties = data.get("properties")
    series = properties.get("timeseries") if isinstance(properties, dict) else None
    if not isinstance(series, list) or not series:
        raise ProviderError("MET Norway no incluyó pronóstico por horas.")

    today = today or local_today()
    last_day = today + timedelta(days=6)
    days: dict[str, dict] = {}
    current_temp = None

    for entry in series:
        if not isinstance(entry, dict):
            continue
        moment = _local_time(entry.get("time"))
        if moment is None:
            continue
        day = moment.date()
        if day < today or day > last_day:
            continue

        data_block = entry.get("data") if isinstance(entry.get("data"), dict) else {}
        instant = data_block.get("instant") if isinstance(data_block.get("instant"), dict) else {}
        details = instant.get("details") if isinstance(instant.get("details"), dict) else {}
        temp = _number(details.get("air_temperature"))
        humidity = _number(details.get("relative_humidity"))
        wind = _number(details.get("wind_speed"))
        wind_kmh = round(wind * 3.6, 1) if wind is not None else None

        record = days.setdefault(day.isoformat(), {
            "temps": [], "precip": 0.0, "has_precip": False, "symbols": [], "hours": [],
        })
        if temp is not None:
            record["temps"].append(temp)
            if current_temp is None:
                current_temp = temp

        precip_hour = None
        symbol = None
        # MET Norway entrega el detalle en next_1h, next_6h o next_12h según el horizonte.
        for key in ("next_1_hours", "next_6_hours", "next_12_hours"):
            block = data_block.get(key)
            if not isinstance(block, dict):
                continue
            block_details = block.get("details") if isinstance(block.get("details"), dict) else {}
            amount = _number(block_details.get("precipitation_amount"))
            if amount is not None:
                record["precip"] += amount
                record["has_precip"] = True
                if key == "next_1_hours":
                    precip_hour = amount
                break
        for key in ("next_1_hours", "next_6_hours", "next_12_hours"):
            block = data_block.get(key)
            summary = block.get("summary") if isinstance(block, dict) and isinstance(block.get("summary"), dict) else {}
            code = summary.get("symbol_code")
            if code:
                symbol = str(code)
                break
        if symbol:
            record["symbols"].append(symbol)

        record["hours"].append({
            "time": moment.strftime("%Y-%m-%dT%H:00"),
            "temperature_2m": temp,
            "relative_humidity_2m": humidity,
            "wind_speed_10m": wind_kmh,
            "wind_gusts_10m": None,
            "precipitation": precip_hour,
            "precipitation_probability": None,
        })

    daily = []
    hourly = []
    for key in sorted(days):
        record = days[key]
        if not record["temps"]:
            continue
        code = _day_code(record["symbols"])
        daily.append(DailyValue(
            date=key,
            tmin=min(record["temps"]),
            tmax=max(record["temps"]),
            precip_mm=round(record["precip"], 2) if record["has_precip"] else None,
            precip_prob=None,
            weather_code=code,
            storm=code in STORM_CODES if code is not None else False,
        ))
        hourly.extend(record["hours"])

    if not daily:
        raise ProviderError("MET Norway no incluyó días con temperatura para esta ubicación.")

    geometry = data.get("geometry") if isinstance(data.get("geometry"), dict) else {}
    coords = geometry.get("coordinates")
    elevation = coords[2] if isinstance(coords, list) and len(coords) > 2 else None
    return Block(
        available=True,
        source=SOURCE,
        kind="pronostico",
        fetched_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        daily=daily,
        current_temp=current_temp,
        current_time=local_now().strftime("%Y-%m-%dT%H:%M"),
        extra={"license": LICENSE, "provider": "metno", "grid_elevation_m": elevation,
               "hourly": sorted(hourly, key=lambda row: row["time"])[:72]},
    )


def _local_time(value) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(BOLIVIA_TZ)


def _number(value) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


_SEVERITY = {95: 7, 99: 8, 82: 6, 65: 5, 81: 5, 80: 4, 63: 4, 61: 4, 75: 4, 73: 4, 71: 4, 45: 3, 3: 2, 2: 1, 1: 0, 0: -1}


def _day_code(symbols: list[str]) -> int | None:
    codes = [code for code in (_symbol_code(symbol) for symbol in symbols) if code is not None]
    return max(codes, key=lambda code: _SEVERITY.get(code, 0)) if codes else None


def _symbol_code(symbol: str) -> int | None:
    s = symbol.lower()
    for suffix in ("_day", "_night", "_polartwilight"):
        if s.endswith(suffix):
            s = s[:-len(suffix)]
            break
    if "thunder" in s:
        return 95
    if "sleet" in s:
        return 71
    if "snow" in s:
        return 71
    if "rainshowers" in s:
        return 80
    if "rain" in s:
        return 65 if "heavy" in s else 61
    if "fog" in s:
        return 45
    if "partlycloudy" in s:
        return 2
    if "cloudy" in s:
        return 3
    if "fair" in s:
        return 1
    if "clearsky" in s:
        return 0
    return None
