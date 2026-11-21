"""Condiciones para aplicar productos (pulverización), calculadas con el pronóstico por hora.

Criterios generales de buenas prácticas de aplicación (guías de extensión agrícola y etiquetas):
  * Viento entre 3 y 15 km/h. Más fuerte: deriva hacia otros cultivos y casas. Casi sin viento:
    posible inversión térmica (la neblina de producto queda suspendida y se desplaza).
  * Sin lluvia durante la aplicación ni en las 2 horas siguientes (lava el producto).
  * Temperatura menor a 30 °C y humedad relativa mayor a 40 % (si no, las gotas se evaporan).
Son criterios generales: la etiqueta de cada producto manda.
"""
from datetime import datetime, timedelta, timezone

BOLIVIA = timezone(timedelta(hours=-4))
FIELDS = ("temperature_2m", "relative_humidity_2m", "wind_speed_10m", "wind_gusts_10m", "precipitation", "precipitation_probability")
LABEL = {"bueno": "Buenas", "moderado": "Moderadas", "no": "No recomendado"}
NOTE = ("Criterios generales de buenas prácticas: viento de 3 a 15 km/h, sin lluvia en 2 horas, menos de 30 °C y humedad "
        "mayor a 40 %. Siga siempre la etiqueta del producto y use equipo de protección.")


def hourly_series(hourly: dict, hours: int = 72) -> list[dict] | None:
    """Recorta el pronóstico por hora de Open-Meteo a lo necesario para el cálculo."""
    times = hourly.get("time") or []
    if not times or not all(hourly.get(f) for f in ("wind_speed_10m", "temperature_2m")):
        return None
    out = []
    for i, t in enumerate(times[:hours]):
        row = {"time": t}
        for f in FIELDS:
            arr = hourly.get(f) or []
            row[f] = arr[i] if i < len(arr) else None
        out.append(row)
    return out


def _hour_status(rows: list[dict], i: int) -> tuple[str, list[str]]:
    h = rows[i]
    bad, mid = [], []
    nxt = rows[i:i + 3]
    if any((r["precipitation"] or 0) > 0.1 or (r["precipitation_probability"] or 0) >= 60 for r in nxt):
        bad.append("lluvia probable en las próximas 2 horas")
    wind, gust = h["wind_speed_10m"], h["wind_gusts_10m"]
    if wind is not None and wind > 15:
        bad.append(f"viento fuerte ({round(wind)} km/h): riesgo de deriva")
    elif gust is not None and gust > 25:
        mid.append(f"ráfagas de {round(gust)} km/h")
    elif wind is not None and wind < 3:
        mid.append("casi sin viento: posible inversión térmica")
    t, rh = h["temperature_2m"], h["relative_humidity_2m"]
    if t is not None and t > 30:
        bad.append(f"calor ({round(t)} °C): el producto se evapora")
    elif t is not None and t < 2:
        mid.append(f"frío ({round(t)} °C): la planta absorbe menos")
    if rh is not None and rh < 40:
        mid.append(f"aire seco ({round(rh)} % de humedad)")
    if bad:
        return "no", bad + mid
    return ("moderado", mid) if mid else ("bueno", [])


def spray_conditions(series: list[dict] | None, now: datetime | None = None) -> dict | None:
    if not series:
        return None
    now = (now or datetime.now(timezone.utc)).astimezone(BOLIVIA)
    key = now.strftime("%Y-%m-%dT%H:00")
    start = next((i for i, r in enumerate(series) if r["time"] >= key), None)
    if start is None or len(series) - start < 3:
        return None
    rows = series[start:]
    hours = []
    for i in range(min(24, len(rows) - 2)):
        status, reasons = _hour_status(rows, i)
        hours.append({"time": rows[i]["time"], "status": status, "reasons": reasons,
                      "wind_kmh": rows[i]["wind_speed_10m"], "temp_c": rows[i]["temperature_2m"],
                      "rh": rows[i]["relative_humidity_2m"]})
    now_h = hours[0]
    # Mejor ventana de día (6:00 a 18:00): primer tramo de 2 horas o más con condiciones buenas.
    best, run = None, []
    for h in hours + [None]:
        if h and h["status"] == "bueno" and 6 <= int(h["time"][11:13]) <= 18:
            run.append(h)
            continue
        if len(run) >= 2:
            best = {"start": run[0]["time"], "end": run[-1]["time"]}
            break
        run = []
    return {"status": now_h["status"], "label": LABEL[now_h["status"]], "reasons": now_h["reasons"],
            "wind_kmh": now_h["wind_kmh"], "temp_c": now_h["temp_c"], "rh": now_h["rh"],
            "best_window": best, "hours": [{k: h[k] for k in ("time", "status")} for h in hours], "note": NOTE}
