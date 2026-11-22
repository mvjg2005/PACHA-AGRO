"""Uywa · Ganado en riesgo: noches peligrosas, año seco, invierno, pérdidas e informe."""
from datetime import date, timedelta

import pytest

from app.services.weather.base import Block, DailyValue
from tests.conftest import register

TODAY = date(2026, 11, 21)


def history():
    """Serie sintética desde 2001: lluvia de nov–mar, heladas en invierno y una nevada el 3/6/2025."""
    d, out = date(2001, 1, 1), {}
    while d <= TODAY - timedelta(days=5):
        c = d.year if d.month >= 7 else d.year - 1
        season = {2025: 260}.get(c, 300 + (c % 7) * 20)
        rain = season / 151 if d.month in (11, 12, 1, 2, 3) else 0.0
        tmin = -4.0 if d.month in (6, 7, 8) else 3.0
        if d == date(2025, 6, 3):
            rain, tmin = 44.0, -3.0
        out[d.isoformat()] = [tmin, rain]
        d += timedelta(days=1)
    return out


@pytest.fixture
def hist(monkeypatch):
    from app.services import senas
    data = history()
    monkeypatch.setattr(senas, "_history", lambda m, today: data)
    return data


def test_night_levels():
    from app.services.livestock import night_level
    assert night_level(-12, False, 5)[0] == "extremo"
    assert night_level(-4, True, None)[0] == "extremo"
    assert night_level(-7, False, None)[0] == "alto"
    assert night_level(-4, False, 30) == ("alto", ["mínima de -4 °C", "viento de 30 km/h en la noche"])
    assert night_level(-2.5, False, 10)[0] == "medio"
    assert night_level(4, False, 40)[0] == "bajo"


def test_nights_from_forecast(app_client, monkeypatch):
    from app.services.weather import service
    days = [DailyValue(date="2026-11-21", tmin=-11, precip_mm=0, weather_code=0),
            DailyValue(date="2026-11-22", tmin=-1, precip_mm=7, weather_code=61),   # lluvia con helada = nevada probable
            DailyValue(date="2026-11-23", tmin=5, precip_mm=0, weather_code=0)]
    hourly = [{"time": "2026-11-21T22:00", "wind_speed_10m": 33}]
    monkeypatch.setattr(service, "_forecast", lambda *a, **k: Block(available=True, source="Prueba", kind="pronostico", daily=days, extra={"hourly": hourly}))
    d = app_client.get("/api/ganado/noches?municipality_id=or-challapata").json()
    assert [n["level"] for n in d["nights"]] == ["extremo", "alto", "bajo"]
    assert d["nights"][1]["snow"] is True and d["worst"]["date"] == "2026-11-21" and d["nights"][0]["wind_kmh"] == 33
    assert "crías" in " ".join(d["nights"][0]["actions"])


def test_nights_unavailable_is_honest(app_client, monkeypatch):
    from app.services.weather import service
    monkeypatch.setattr(service, "_forecast", lambda *a, **k: Block(available=False, source="x", kind="pronostico", error="sin red"))
    d = app_client.get("/api/ganado/noches?municipality_id=or-challapata").json()
    assert d["available"] is False and d["nights"] == []


def test_drought_and_winter_with_snow_event(app_client, hist, monkeypatch):
    from app.services import livestock
    from app.data.catalog import get_municipality
    monkeypatch.setattr(livestock, "local_today", lambda: TODAY)
    with _db() as db:
        d = livestock.drought(db, get_municipality("or-challapata"), TODAY)
    assert d["last_season"]["value"] == "seco" and any("temporada pasada" in s for s in d["signals"])
    assert d["level"] in ("media", "alta") and d["actions"]
    w = livestock.winter_climate(get_municipality("or-challapata"), 2025, TODAY)
    assert w["winter"] == "junio a agosto de 2026"
    w25 = livestock.winter_climate(get_municipality("or-challapata"), 2024, TODAY)
    assert w25["snow_events"] == [{"date": "2025-06-03", "precip_mm": 44.0, "tmin": -3.0}]
    assert w25["rain_mm"] > w25["normal_rain_mm"]


def _db():
    from app import db as dbmod
    return dbmod.SessionLocal()


def test_losses_summary_report_and_privacy(app_client, hist, monkeypatch):
    c = app_client
    from app.services import livestock
    monkeypatch.setattr(livestock, "local_today", lambda: TODAY)
    assert c.post("/api/ganado/perdidas", json={}).status_code in (401, 422)
    a, b = register(c, "71290001", name="Rosa Choque"), register(c, "71290002", name="Juan Mamani")
    post = lambda h, **kw: c.post("/api/ganado/perdidas", json={"municipality_id": "or-challapata", "date": "2025-07-14", **kw}, headers=h)  # noqa: E731
    assert post(a, species="oveja", count=2, cause="depredador", community_name="Huayñacagua", notes="corderos").status_code == 201
    assert post(a, species="oveja", count=3, cause="hambre", community_name="huayñacagua").status_code == 201
    assert post(b, species="llama", count=4, cause="nevada", date="2025-06-04", community_name="Otra comunidad").status_code == 201
    assert post(b, species="gato", count=1, cause="nevada").status_code == 422
    assert post(b, species="oveja", count=0, cause="nevada").status_code == 422
    assert post(b, species="oveja", count=1, cause="nevada", date="2099-01-01").status_code == 422
    s = c.get("/api/ganado/perdidas/resumen?municipality_id=or-challapata&campaign=2025").json()
    assert s["animals"] == 5 and s["families"] == 1 and s["communities"] == [{"name": "Huayñacagua", "count": 5}]
    s24 = c.get("/api/ganado/perdidas/resumen?department_id=oruro&campaign=2024").json()
    assert s24["by_species"] == [{"id": "llama", "label": "Llamas", "count": 4}] and s24["by_cause"][0]["label"] == "Nevada"
    assert "Rosa" not in str(s) and "corderos" not in str(s)  # sin nombres ni notas
    mine = c.get("/api/ganado/perdidas/mias", headers=a).json()
    assert len(mine) == 2 and mine[0]["notes"] in ("corderos", "")
    assert c.delete(f"/api/ganado/perdidas/{mine[0]['id']}", headers=b).status_code == 404
    assert c.delete(f"/api/ganado/perdidas/{mine[0]['id']}", headers=a).status_code == 200
    r = c.get("/api/ganado/informe?municipality_id=or-challapata&campaign=2024").json()
    assert r["losses"]["animals"] == 4 and r["winter"]["snow_events"] and len(r["requests"]) == 3


def test_catalog(app_client):
    d = app_client.get("/api/ganado/catalogo").json()
    assert "nevada" in d["causes"] and "llama" in d["species"] and len(d["no_roof"]) >= 5


def test_bulletin_sms_is_ascii_and_short(app_client, monkeypatch):
    from app.services import livestock
    from app.services.weather import service
    days = [DailyValue(date=f"2026-11-{23 + i}", tmin=t, tmax=14, precip_mm=p, weather_code=0)
            for i, (t, p) in enumerate([(-9, 0), (-7, 0), (-1, 6), (3, 0), (1, 0), (-3, 0), (2, 0)])]
    blk = Block(available=True, source="Prueba", kind="pronostico", daily=days, extra={})
    monkeypatch.setattr(service, "_forecast", lambda *a, **k: blk)
    d = app_client.get("/api/ganado/boletin?municipality_id=or-challapata").json()
    assert d["available"] and d["sms"].isascii() and len(d["sms"]) <= 306
    assert "Helada fuerte lun 23 (-9C), mar 24 (-7C)" in d["sms"] and "Nevada probable mie 25" in d["sms"] and "crias" in d["sms"]
    assert "miércoles 25" in d["radio"] and "posible nevada" in d["radio"] and "SENAMHI" in d["radio"]


def test_bulletin_without_forecast(app_client, monkeypatch):
    from app.services.weather import service
    monkeypatch.setattr(service, "_forecast", lambda *a, **k: Block(available=False, source="x", kind="pronostico", error="sin red"))
    assert app_client.get("/api/ganado/boletin?municipality_id=or-challapata").json()["available"] is False


def test_public_businesses_with_source_and_filters(app_client):
    d = app_client.get("/api/ganado/negocios?municipality_id=or-challapata").json()
    assert {i["name"] for i in d["items"]} == {"FERTIALTIPLANO", "Daisy Condori Aguilar", "Adrian Cruz Choque"}
    assert "no los verificó" in d["note"] and d["source"]["url"].startswith("https://boliviahub.com/")
    vet = app_client.get("/api/ganado/negocios?municipality_id=or-oruro&service=veterinaria").json()["items"]
    assert [i["name"] for i in vet] == ["FERTIALTIPLANO"] and vet[0]["same_municipality"] is False
    assert vet[0]["whatsapp_url"] == "https://wa.me/59168313350" and "nit" not in str(vet[0]).lower()
    assert app_client.get("/api/ganado/negocios?municipality_id=lp-el-alto").json()["items"] == []  # otro departamento
