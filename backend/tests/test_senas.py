"""Señas andinas medidas con datos (terciles sobre la serie diaria desde 2001) y Pachagrama."""
from datetime import date, timedelta

import pytest

from tests.conftest import register

TODAY = date(2026, 11, 21)
RAIN = {2015: 200, 2023: 350, 2024: 480, 2025: 260}  # mm de noviembre a marzo; el resto de años, 300–420
FROST = {2015: 28, 2024: 4}


def synthetic_history():
    """Serie diaria sintética: lluvia solo de noviembre a marzo y heladas al inicio de sep–nov."""
    daily, d = {}, date(2001, 1, 1)
    while d <= TODAY - timedelta(days=5):
        c = d.year if d.month >= 7 else d.year - 1
        total = RAIN.get(c, 300 + (c % 7) * 20)
        rain = total / 151 if d.month in (11, 12, 1, 2, 3) else 0.0
        frost_days = FROST.get(c, 15 + (c % 5) * 3)
        idx = (d - date(c, 9, 1)).days
        tmin = -2.0 if 0 <= idx < 91 and idx % 91 < frost_days else 4.0
        daily[d.isoformat()] = [tmin, rain]
        d += timedelta(days=1)
    return daily


@pytest.fixture
def history(monkeypatch):
    from app.services import senas
    data = synthetic_history()
    monkeypatch.setattr(senas, "_history", lambda m, today: data)
    monkeypatch.setattr(senas, "date", type("D", (date,), {"today": staticmethod(lambda: TODAY)}))
    return data


def test_outcome_by_terciles(history):
    from app.data.catalog import get_municipality
    from app.services import senas
    m = get_municipality("or-challapata")
    assert senas.outcome(m, 2015, TODAY, history)["lluvia"]["value"] == "seco"
    o = senas.outcome(m, 2024, TODAY, history)
    assert o["lluvia"]["value"] == "lluvioso" and o["helada"]["value"] == "pocas" and o["lluvia"]["years"] >= 20
    assert senas.outcome(m, 2015, TODAY, history)["helada"]["value"] == "muchas"
    cur = senas.outcome(m, 2026, TODAY, history)
    assert cur["lluvia"]["status"] == "pendiente" and cur["lluvia"]["available_after"] == "2027-04-08"
    assert senas.outcome(m, 2024, TODAY, {})["lluvia"]["status"] == "sin_datos"


def test_metric_checks_valid_values_of_each_variable():
    from app.services.senas import _days_in, _metric, windows

    # 11 de 91 temperaturas faltantes superan el 10 %: no se deben contar como días sin helada.
    start, end = windows(2024)["helada"]
    frost_days = [d.isoformat() for d in _days_in(start, end)]
    frost_history = {day: [None if i < 11 else -1.0, 2.0] for i, day in enumerate(frost_days)}
    assert _metric(frost_history, "helada", 2024) is None

    # 16 de 151 lluvias faltantes superan el 10 % aunque todas las filas existan.
    start, end = windows(2024)["lluvia"]
    rain_days = [d.isoformat() for d in _days_in(start, end)]
    rain_history = {day: [3.0, None if i < 16 else 1.0] for i, day in enumerate(rain_days)}
    assert _metric(rain_history, "lluvia", 2024) is None

    # Hasta el 10 % sí se estima proporcionalmente usando solo valores válidos.
    valid_rain = {day: [3.0, None if i < 15 else 1.0] for i, day in enumerate(rain_days)}
    assert _metric(valid_rain, "lluvia", 2024) == float(len(rain_days))


def _post(c, h, **kw):
    return c.post("/api/senas/observaciones", json={"municipality_id": "or-challapata", **kw}, headers=h)


def test_register_validate_and_consensus(app_client, history):
    c = app_client
    cat = c.get("/api/senas").json()
    assert {s["id"] for s in cat["senas"]} >= {"qutu", "leque", "atoq", "otra"} and "Nature" in cat["senas"][0]["source"]
    assert _post(c, {}, sena_id="qutu", reading="brillante", observed_on="2025-06-24").status_code == 401
    h = register(c, "71240001")
    assert _post(c, h, sena_id="qutu", reading="azul", observed_on="2025-06-24").status_code == 422
    assert _post(c, h, sena_id="otra", reading="seco", observed_on="2025-06-24").status_code == 422  # falta el nombre
    assert _post(c, h, sena_id="qutu", reading="brillante", observed_on="2099-06-24").status_code == 422
    r = _post(c, h, sena_id="qutu", reading="opaca", observed_on="2025-06-24", notes="Se veían pequeñas")
    assert r.status_code == 201 and r.json()["campaign"] == 2024  # junio pertenece a la campaña que empezó el año anterior
    assert _post(c, h, sena_id="qutu", reading="opaca", observed_on="2025-06-25").status_code == 409
    assert _post(c, h, sena_id="otra", reading="muchas_heladas", custom_name="Rueda en la luna", observed_on="2024-08-02").status_code == 201
    z = c.get("/api/senas/zona?municipality_id=or-challapata&campaign=2024", headers=h).json()
    assert z["municipality"]["name"] == "Challapata" and z["local"]["n"] == 2 and z["local"]["votes"]["lluvia"]["seco"] == 1
    assert z["outcome"]["lluvia"]["value"] == "lluvioso" and len(z["mine"]) == 2 and z["mine"][0]["notes"]
    other = c.get("/api/senas/zona?municipality_id=or-challapata&campaign=2024").json()
    assert other["mine"] == [] and all(o["notes"] == "" for o in other["recent"])  # las notas son privadas
    assert c.get("/api/senas/zona?municipality_id=or-challapata&campaign=2030").status_code == 422


def test_reliability_against_chance(app_client, history):
    c = app_client
    for i, (day, reading) in enumerate([("2016-06-24", "opaca"), ("2024-06-24", "brillante"), ("2025-06-24", "brillante"), ("2026-06-24", "brillante")]):
        h = register(c, f"7125000{i}")
        assert _post(c, h, sena_id="qutu", reading=reading, observed_on=day).status_code == 201
    r = c.get("/api/senas/confiabilidad?department_id=oruro").json()
    q = next(s for s in r["senas"] if s["sena_id"] == "qutu")
    # 2015 seco (opaca acierta), 2023 normal y 2024 lluvioso (brillante acierta), 2025 seco (brillante falla)
    assert q["observations"] == 4 and q["evaluated"] == 4 and q["hits"] == 3 and q["rate"] == 75
    assert q["chance"] == round((1 / 3 + 3 * 2 / 3) / 4 * 100) and q["enough"] is False
    assert c.get("/api/senas/confiabilidad?department_id=marte").status_code == 422


def test_pachagrama_weeks_reports_and_senas(app_client, history):
    c = app_client
    h = register(c, "71260001")
    _post(c, h, sena_id="leque", reading="alto", observed_on="2024-09-20")
    p = c.get("/api/pachagrama?municipality_id=or-challapata&campaign=2024").json()
    assert len(p["weeks"]) == 52 and p["data_available"] and p["campaign_label"] == "2024–2025"
    nov = next(w for w in p["weeks"] if w["start"] <= "2024-11-15" <= w["end"])
    assert nov["rain_mm"] > 20 and nov["normal_mm"] > 10
    sep = next(w for w in p["weeks"] if w["start"] <= "2024-09-20" <= w["end"])
    assert sep["senas"] == ["Nido del leque leque"]
    assert p["outcome"]["lluvia"]["value"] == "lluvioso"


def test_delete_own_sena_only(app_client, history):
    c = app_client
    a, b = register(c, "71270001"), register(c, "71270002")
    oid = _post(c, a, sena_id="atoq", reading="claro", observed_on="2025-08-01").json()["id"]
    assert c.delete(f"/api/senas/observaciones/{oid}", headers=b).status_code == 404
    assert c.delete(f"/api/senas/observaciones/{oid}", headers=a).status_code == 200
