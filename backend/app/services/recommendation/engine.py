"""Motor de recomendación de siembra EXPLICABLE (reglas + evaluación multicriterio).

Diseño:
  * No consulta fuentes de datos: recibe un `WeatherView` ya normalizado. Así se puede cambiar la
    fuente (o un futuro modelo de ML) sin tocar las reglas.
  * Cada criterio devuelve estado, explicación y tipo de dato usado (pronóstico, estimación,
    dato del agricultor, observación comunitaria, simulado).
  * Pesos y umbrales vienen de `app/data/crops.json` (configurables y documentados).
  * El puntaje es EXPERIMENTAL: sirve para ordenar criterios, no es una probabilidad.
"""
from dataclasses import asdict, dataclass, field
from datetime import date

GREEN, YELLOW, RED, GRAY = "verde", "amarillo", "rojo", "gris"
_VALUE = {GREEN: 1.0, YELLOW: 0.5, RED: 0.0}

HEADLINES = {
    GREEN: "Condiciones favorables",
    YELLOW: "Se recomienda precaución",
    RED: "Condiciones desfavorables",
    GRAY: "Información insuficiente",
}


@dataclass
class Answers:
    crop: str
    variety: str | None
    soil_moisture: str  # si | poca | no | no_se
    irrigation: str  # riego | secano


@dataclass
class WeatherView:
    mode: str  # real | simulado
    forecast_available: bool
    forecast_source: str | None
    forecast_kind: str | None
    daily: list[dict]
    soil_model: float | None
    soil_model_kind: str | None  # open_meteo_m3m3 | nasa_gwettop
    soil_model_source: str | None
    recent_daily: list[dict] = field(default_factory=list)
    recent_source: str | None = None
    frost_days_month: float | None = None
    community_hail_reports: int = 0
    community_frost_reports: int = 0


@dataclass
class Criterion:
    id: str
    label: str
    status: str
    explanation: str
    data_kind: str  # pronostico | estimacion | climatologia | agricultor | comunidad | calendario | simulado | sin_datos
    source: str | None = None
    value: str | None = None
    hint: str | None = None  # matiz para elegir la acción principal (p. ej. calendario temprano/tarde)


def _in_window(today: date, start: str, end: str) -> bool:
    md = today.strftime("%m-%d")
    if start <= end:
        return start <= md <= end
    return md >= start or md <= end  # ventana que cruza el año (ej. nov-ene)


_DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]


def _day(iso: str) -> str:
    """'2026-11-23' -> 'lun 23 nov' (más fácil de leer que la fecha ISO)."""
    try:
        d = date.fromisoformat(iso)
    except ValueError:
        return iso
    return f"{_DIAS[d.weekday()]} {d.day} {_fmt(d.strftime('%m-%d')).split()[1]}"


def _fmt(md: str) -> str:
    meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    m, d = md.split("-")
    return f"{int(d)} {meses[int(m) - 1]}"


def evaluate(cfg: dict, municipality: dict, answers: Answers, wx: WeatherView, today: date) -> dict:
    crop = cfg["crops"].get(answers.crop)
    if crop is None:
        raise ValueError("Cultivo no registrado")
    region = municipality["region"]
    scenario = crop.get("regions", {}).get(region, "no_rules")
    base = {
        "crop": answers.crop, "crop_name": crop["name"], "variety": answers.variety,
        "location": {"id": municipality["id"], "name": municipality["name"], "department_name": municipality["department_name"], "region": region},
        "scenario_status": scenario, "scenario_label": cfg["status_labels"][scenario],
        "mode": wx.mode, "disclaimer": cfg["disclaimer"], "config_version": cfg["version"],
        "variety_note": crop.get("variety_note"), "sources": crop.get("sources", []), "notes": crop.get("notes", []),
    }

    if scenario == "no_rules" or not crop.get("thresholds"):
        return {**base, "status": GRAY, "headline": HEADLINES[GRAY], "criteria": [], "score": None, "confidence": "ninguna",
                "summary": f"Todavía no tenemos reglas revisadas para {crop['name'].lower()} en la región de {region}. "
                           "No damos una recomendación para no confundirle. Consulte a un técnico agrícola de su zona.",
                "actions": ["Consulte a su técnico o promotor agrícola.", "Revise el pronóstico de heladas en la sección Clima."],
                "key_factor": None, "main_action": "Consulte a su técnico o promotor agrícola antes de sembrar.",
                "missing_data": ["reglas para este cultivo en esta región"],
                "confidence_explanation": "Sin orientación: no hay reglas cargadas para este cultivo en esta región."}

    th = crop["thresholds"]
    sim = wx.mode == "simulado"
    fk = "simulado" if sim else "pronostico"
    criteria: list[Criterion] = [
        _calendar(cfg, answers.crop, municipality, today),
        _frost(th, wx, fk),
        _moisture(cfg, answers, wx),
        _rain(th, answers, wx, fk),
        _storm(wx, fk),
        _temperature(th, wx, fk),
    ]

    weights = cfg["weights"]
    critical = set(cfg["critical_criteria"])
    by_id = {c.id: c for c in criteria}
    scored = [c for c in criteria if c.status in _VALUE]
    wsum = sum(weights[c.id] for c in scored)
    score = round(sum(weights[c.id] * _VALUE[c.status] for c in scored) / wsum, 2) if wsum else None

    if any(by_id[k].status == GRAY for k in critical):
        status = GRAY
    elif any(by_id[k].status == RED for k in critical):
        status = RED
    elif score is not None and score >= cfg["aggregation"]["green_min_score"] and not any(by_id[k].status == YELLOW for k in critical):
        status = GREEN
    else:
        status = YELLOW

    confidence = "baja" if sim or not wx.forecast_available else ("media" if scenario == "demo" else "media-alta")
    key = key_factor(status, criteria, weights, critical, cfg.get("key_factor_priority", []))
    return {
        **base, "status": status, "headline": HEADLINES[status], "score": score, "confidence": confidence,
        "criteria": [asdict(c) for c in criteria],
        "summary": _summary(status, criteria, crop["name"], critical),
        "actions": _actions(status, criteria),
        "key_factor": asdict(key) if key else None,
        "main_action": main_action(status, key),
        "missing_data": [c.label for c in criteria if c.status == GRAY],
        "confidence_explanation": _confidence_text(confidence, sim, wx.forecast_available, scenario),
    }


_SEVERITY = {RED: 2, YELLOW: 1}


def key_factor(status: str, criteria: list[Criterion], weights: dict, critical: set, priority: list[str]) -> Criterion | None:
    """Factor que más pesa en el resultado.

    * Información insuficiente: el criterio crítico sin datos.
    * Rojo / amarillo: el criterio más desfavorable (rojo > amarillo); a igual estado gana el criterio
      crítico, luego el de mayor peso y luego el orden de `key_factor_priority`. Los criterios no críticos
      sin datos no deciden el resultado (se informan en `missing_data`).
    * Verde: el criterio crítico de mayor peso (todos a favor).
    Desempates documentados en docs/ALGORITMO.md."""
    def rank(c: Criterion):
        prio = priority.index(c.id) if c.id in priority else len(priority)
        return (-(c.id in critical), -weights.get(c.id, 0), prio)

    if status == GRAY:
        pool = [c for c in criteria if c.id in critical and c.status == GRAY]
    elif status == GREEN:
        pool = [c for c in criteria if c.id in critical]
    else:
        scored = [c for c in criteria if c.status in (RED, YELLOW)]
        worst = max((_SEVERITY[c.status] for c in scored), default=0)
        pool = [c for c in scored if _SEVERITY[c.status] == worst]
    return min(pool, key=rank) if pool else None


_ACTION = {
    ("helada", RED): "Espere: no siembre hasta que pasen los días con helada fuerte.",
    ("helada", YELLOW): "Siembre después de los días con riesgo de helada y revise la temperatura mínima cada mañana.",
    ("helada", GRAY): "Vuelva a consultar más tarde: sin pronóstico no podemos descartar heladas.",
    ("humedad", RED): "Espere una lluvia o riegue antes de sembrar: el suelo está seco.",
    ("humedad", YELLOW): "Revise la humedad con la prueba del puño antes de sembrar.",
    ("humedad", GRAY): "Revise la humedad de su terreno con la mano y vuelva a consultar.",
    ("calendario", RED): "Consulte a su técnico: estamos fuera de la época habitual de siembra.",
    ("calendario", GRAY): "Consulte a su técnico: no tenemos el calendario de siembra de su zona.",
    ("lluvia", RED): "Prepare el terreno y espere una lluvia antes de sembrar.",
    ("lluvia", YELLOW): "Prepare el terreno y siembre cuando haya más humedad.",
    ("tormenta", YELLOW): "Esté atento a tormentas y avise a su comunidad si cae granizo.",
    ("temperatura", YELLOW): "La semilla puede tardar en nacer; puede esperar días más templados.",
}


def main_action(status: str, key: Criterion | None) -> str:
    """Una sola acción, en lenguaje sencillo, ligada al factor decisivo."""
    if status == GREEN or key is None:
        return "Puede preparar la siembra. Revise el pronóstico cada día y converse con su comunidad."
    if key.id == "helada" and key.data_kind == "climatologia":
        return "Vuelva a consultar antes de sembrar: hoy no hay pronóstico de heladas."
    if key.id == "calendario" and key.status == YELLOW:
        return ("Puede esperar unos días: la mejor época de siembra aún no empieza." if key.hint == "temprano"
                else "Si va a sembrar, hágalo pronto: la mejor época ya pasó.")
    if key.id == "lluvia" and key.hint == "lluvia_fuerte":
        return "Evite sembrar justo antes de la lluvia fuerte pronosticada."
    return _ACTION.get((key.id, key.status), "Faltan datos: vuelva a consultar más tarde o pregunte a su técnico.")


def _confidence_text(confidence: str, sim: bool, forecast: bool, scenario: str) -> str:
    base = "La confianza indica qué tan completos y reales son los datos usados; no es la probabilidad de una buena cosecha."
    if sim:
        why = "Baja: los datos del clima son simulados y solo sirven para demostrar."
    elif not forecast:
        why = "Baja: no hay pronóstico; se usó el historial del mes."
    elif scenario == "demo":
        why = "Media: hay pronóstico, pero las reglas de este cultivo son de demostración."
    else:
        why = "Media-alta: hay pronóstico real, pero las reglas aún no están validadas por agrónomos."
    return f"{why} {base}"


def _calendar(cfg, crop_id, m, today) -> Criterion:
    cal = next((c for c in cfg["calendars"] if c["crop"] == crop_id and c["department_id"] == m["department_id"]), None)
    if cal is None:
        return Criterion("calendario", "Época de siembra", GRAY,
                         f"No hay un calendario de siembra cargado para {m['department_name']}.", "sin_datos")
    w, o = cal["window"], cal["optimal"]
    rango = f"{_fmt(o[0])} – {_fmt(o[1])}"
    if _in_window(today, *o):
        st, ex = GREEN, f"Estamos dentro de la época más usada para sembrar ({rango})."
    elif _in_window(today, *w):
        early = _in_window(today, w[0], o[0])
        st = YELLOW
        ex = (f"Estamos en la época posible ({_fmt(w[0])} – {_fmt(w[1])}), pero "
              + (f"antes de la mejor época ({rango})." if early else f"la mejor época ({rango}) ya pasó."))
        return Criterion("calendario", "Época de siembra", st, ex, "calendario", cal["source"], today.isoformat(),
                         "temprano" if early else "tarde")
    else:
        st, ex = RED, f"Estamos fuera de la época de siembra habitual ({_fmt(w[0])} – {_fmt(w[1])})."
    return Criterion("calendario", "Época de siembra", st, ex, "calendario", cal["source"], today.isoformat())


def _frost(th, wx: WeatherView, fk) -> Criterion:
    label = "Riesgo de helada (7 días)"
    if wx.forecast_available and wx.daily:
        tmin_day = min((d for d in wx.daily if d.get("tmin") is not None), key=lambda d: d["tmin"], default=None)
        if tmin_day:
            t = tmin_day["tmin"]
            if t <= th["frost_red_c"]:
                st, ex = RED, f"Se pronostica una mínima de {t:.0f} °C el {_day(tmin_day['date'])}. Es una helada fuerte para plantas recién nacidas."
            elif t <= th["frost_yellow_c"]:
                st, ex = YELLOW, f"Se pronostica una mínima de {t:.0f} °C el {_day(tmin_day['date'])}. Puede haber helada leve; a ras del suelo puede hacer más frío."
            else:
                st, ex = GREEN, f"La mínima pronosticada es {t:.0f} °C. No se espera helada en los próximos días."
            if wx.community_frost_reports and st != RED:
                st = YELLOW
                ex += (f" Además, la comunidad confirmó {wx.community_frost_reports} reporte(s) de helada "
                       "en los últimos 7 días (observación comunitaria, no aviso oficial).")
                return Criterion("helada", label, st, ex, "comunidad",
                                 f"{wx.forecast_source} + observaciones comunitarias",
                                 f"{t} °C; {wx.community_frost_reports} reporte(s)")
            return Criterion("helada", label, st, ex, fk, wx.forecast_source, f"{t} °C")
    if wx.community_frost_reports:
        return Criterion("helada", label, YELLOW,
                         f"La comunidad confirmó {wx.community_frost_reports} reporte(s) de helada en los últimos 7 días. "
                         "Es una observación comunitaria, no un aviso oficial.", "comunidad",
                         "Observaciones comunitarias confirmadas de AgroBolivia",
                         f"{wx.community_frost_reports} reporte(s)")
    if wx.frost_days_month is not None:
        return Criterion("helada", label, YELLOW,
                         f"No hay pronóstico disponible. En este mes suele haber unos {wx.frost_days_month:.0f} días con helada (promedio histórico). "
                         "Sin pronóstico no podemos descartar heladas.", "climatologia", "NASA POWER (climatología)",
                         f"{wx.frost_days_month} días/mes")
    return Criterion("helada", label, GRAY, "No hay pronóstico ni historial de heladas disponible.", "sin_datos")


def _moisture(cfg, a: Answers, wx: WeatherView) -> Criterion:
    label = "Humedad del suelo"
    model_txt = ""
    model_status = None
    if wx.soil_model is not None and wx.soil_model_kind:
        t = cfg["soil_model_thresholds"][wx.soil_model_kind]
        model_status = GREEN if wx.soil_model >= t["green"] else YELLOW if wx.soil_model >= t["yellow"] else RED
        model_txt = f" La estimación por modelo ({wx.soil_model_source}) indica humedad {'buena' if model_status == GREEN else 'regular' if model_status == YELLOW else 'baja'}."
    if a.soil_moisture == "si":
        return Criterion("humedad", label, GREEN, "Usted indicó que su terreno tiene humedad suficiente." + model_txt, "agricultor", "Dato ingresado por usted", "sí")
    if a.soil_moisture == "poca":
        st = GREEN if a.irrigation == "riego" else YELLOW
        ex = "Usted indicó poca humedad." + (" Como tiene riego, puede regar antes de sembrar." if a.irrigation == "riego" else " La semilla podría no germinar pareja.")
        return Criterion("humedad", label, st, ex + model_txt, "agricultor", "Dato ingresado por usted", "poca")
    if a.soil_moisture == "no":
        if a.irrigation == "riego":
            return Criterion("humedad", label, YELLOW, "Usted indicó que el suelo está seco. Riegue antes de sembrar." + model_txt, "agricultor", "Dato ingresado por usted", "no")
        return Criterion("humedad", label, RED, "Usted indicó que el suelo está seco y depende de la lluvia. La semilla puede no germinar." + model_txt, "agricultor", "Dato ingresado por usted", "no")
    # no_se: usamos el modelo si existe
    if model_status is not None:
        if a.irrigation == "riego" and model_status == RED:
            model_status = YELLOW
        return Criterion("humedad", label, model_status,
                         "Usted no sabe la humedad de su terreno." + model_txt + " Es una estimación para una zona grande; revise su terreno con la mano.",
                         "simulado" if wx.mode == "simulado" else "estimacion", wx.soil_model_source, f"{wx.soil_model}")
    if a.irrigation == "riego":
        return Criterion("humedad", label, YELLOW, "No sabemos la humedad de su terreno, pero tiene riego. Revise el suelo antes de sembrar.", "agricultor", "Dato ingresado por usted", "no sé")
    return Criterion("humedad", label, GRAY, "No sabemos la humedad de su terreno y no hay estimación disponible.", "sin_datos")


def _rain(th, a: Answers, wx: WeatherView, fk) -> Criterion:
    label = "Lluvia próxima (7 días)"
    if not (wx.forecast_available and wx.daily):
        return Criterion("lluvia", label, GRAY, "No hay pronóstico de lluvia disponible.", "sin_datos")
    raw_values = [d.get("precip_mm") for d in wx.daily]
    if not raw_values or any(value is None for value in raw_values):
        return Criterion("lluvia", label, GRAY,
                         "El pronóstico no incluye lluvia para todos los días. No podemos calcular un acumulado fiable.",
                         "sin_datos")
    vals = [float(value) for value in raw_values]
    total, peak = sum(vals), max(vals)
    if peak >= th["heavy_rain_day_mm"]:
        return Criterion("lluvia", label, YELLOW, f"Se pronostica un día con lluvia fuerte ({peak:.0f} mm). Puede endurecer el suelo o arrastrar la semilla.", fk, wx.forecast_source, f"{total:.0f} mm", "lluvia_fuerte")
    if a.irrigation == "riego":
        return Criterion("lluvia", label, GREEN, f"Se esperan {total:.0f} mm. Con riego, la lluvia no es una limitación.", fk, wx.forecast_source, f"{total:.0f} mm")
    if total >= th["rain_ok_7d_mm"]:
        return Criterion("lluvia", label, GREEN, f"Se esperan {total:.0f} mm de lluvia en la semana, lo que ayuda a mantener la humedad.", fk, wx.forecast_source, f"{total:.0f} mm")
    if total >= th["rain_low_7d_mm"]:
        return Criterion("lluvia", label, YELLOW, f"Se espera poca lluvia ({total:.0f} mm en 7 días).", fk, wx.forecast_source, f"{total:.0f} mm")
    return Criterion("lluvia", label, YELLOW if a.soil_moisture == "si" else RED,
                     f"Casi no se espera lluvia ({total:.0f} mm en 7 días) y usted depende de la lluvia.", fk, wx.forecast_source, f"{total:.0f} mm")


def _storm(wx: WeatherView, fk) -> Criterion:
    label = "Tormentas y granizo"
    if wx.community_hail_reports:
        return Criterion("tormenta", label, YELLOW,
                         f"Su comunidad reportó granizo {wx.community_hail_reports} vez/veces en los últimos 7 días (observación comunitaria, no es aviso oficial).",
                         "comunidad", "Observaciones comunitarias de AgroBolivia")
    if not wx.forecast_available:
        return Criterion("tormenta", label, GRAY, "No hay pronóstico de tormentas disponible.", "sin_datos")
    storms = [d["date"] for d in wx.daily if d.get("storm")]
    if storms:
        return Criterion("tormenta", label, YELLOW, f"Se pronostican tormentas ({', '.join(_day(x) for x in storms)}). Puede caer granizo.", fk, wx.forecast_source)
    return Criterion("tormenta", label, GREEN, "No se pronostican tormentas. (El granizo puede ser muy local y no siempre se pronostica.)", fk, wx.forecast_source)


def _temperature(th, wx: WeatherView, fk) -> Criterion:
    label = "Temperatura para germinar"
    days, kind, src = wx.daily, fk, wx.forecast_source
    if not (wx.forecast_available and days):
        days, kind, src = wx.recent_daily, "estimacion", wx.recent_source
    pairs = [(d["tmin"] + d["tmax"]) / 2 for d in days if d.get("tmin") is not None and d.get("tmax") is not None]
    if not pairs:
        return Criterion("temperatura", label, GRAY, "No hay datos de temperatura.", "sin_datos")
    mean = sum(pairs) / len(pairs)
    when = "en los próximos días" if kind != "estimacion" else "en los últimos días (no hay pronóstico)"
    if mean >= th["germination_mean_min_c"]:
        return Criterion("temperatura", label, GREEN, f"La temperatura media {when} es de {mean:.0f} °C, adecuada para germinar.", kind, src, f"{mean:.1f} °C")
    return Criterion("temperatura", label, YELLOW, f"La temperatura media {when} es de {mean:.0f} °C; la germinación puede ser lenta.", kind, src, f"{mean:.1f} °C")


def _summary(status, criteria, crop_name, critical) -> str:
    reds = [c.label.lower() for c in criteria if c.status == RED]
    yellows = [c.label.lower() for c in criteria if c.status == YELLOW]
    grays = [c.label.lower() for c in criteria if c.status == GRAY and c.id in critical]
    n = crop_name.lower()
    if status == GREEN:
        return f"Las condiciones de esta semana son favorables para sembrar {n}."
    if status == RED:
        return f"No es buen momento para sembrar {n}. Motivo principal: {', '.join(reds)}."
    if status == GRAY:
        return f"Nos faltan datos importantes ({', '.join(grays)}) para orientarle sobre {n}."
    return f"Puede sembrar {n} con cuidado. Revise: {', '.join(yellows + reds) or 'los detalles'}."


def _actions(status, criteria) -> list[str]:
    ids = {c.id: c.status for c in criteria}
    acts = []
    if ids.get("helada") in (RED, YELLOW):
        acts.append("Espere a que pasen los días fríos o siembre después de la fecha con helada.")
    if ids.get("humedad") in (RED, YELLOW, GRAY):
        acts.append("Revise la humedad: tome tierra a 5-10 cm; si forma un terrón que no se desarma, hay humedad.")
    if ids.get("tormenta") == YELLOW:
        acts.append("Esté atento a tormentas y avise a su comunidad si cae granizo.")
    if ids.get("calendario") == RED:
        acts.append("Consulte con su técnico si conviene sembrar fuera de época o elegir otro cultivo.")
    acts.append("Antes de decidir, converse con su comunidad o técnico agrícola.")
    return acts
