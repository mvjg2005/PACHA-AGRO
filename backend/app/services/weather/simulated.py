"""Datos SIMULADOS para demostraciones. Deterministas por municipio y fecha. Nunca se presentan como reales."""
import hashlib
import random
from datetime import date, datetime, timedelta, timezone

from app.core.time import local_now, local_today
from app.services.weather.base import Block, DailyValue

SOURCE = "SIMULACIÓN de AgroBolivia (datos ficticios para demostración)"


def simulated_forecast(municipality: dict, today: date | None = None) -> Block:
    today = today or local_today()
    seed = int(hashlib.sha256(f"{municipality['id']}{today.isoformat()}".encode()).hexdigest()[:8], 16)
    rnd = random.Random(seed)
    elev = municipality.get("elevation", 3800)
    base_min = 18 - elev * 0.0055  # gradiente aproximado
    base_max = base_min + (14 if elev > 3000 else 10)
    daily = []
    for i in range(7):
        tmin = round(base_min + rnd.uniform(-3, 3) - (3.5 if i == 2 else 0), 1)  # día 3 más frío para mostrar riesgo
        precip = round(max(0.0, rnd.gauss(2.5, 4)), 1)
        code = 95 if i == 4 and elev > 3000 else (61 if precip > 3 else 2)
        daily.append(DailyValue(
            date=(today + timedelta(days=i)).isoformat(), tmin=tmin, tmax=round(base_max + rnd.uniform(-2, 2), 1),
            precip_mm=precip, precip_prob=min(95, round(precip * 12 + 10)), weather_code=code, storm=code == 95,
        ))
    return Block(
        available=True, source=SOURCE, kind="simulado",
        fetched_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        daily=daily, current_temp=round((daily[0].tmin + daily[0].tmax) / 2, 1),
        current_time=local_now().strftime("%Y-%m-%dT%H:%M"),
        soil_moisture=0.16, soil_moisture_unit="m3/m3 (SIMULADO)",
    )
