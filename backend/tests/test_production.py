"""Mejoras para uso real: caché persistente del clima, GPS, cuentas, modo producción y estado de chat."""
from datetime import date

import httpx
import pytest

from tests.conftest import admin_headers, login, mock_transport, register


# --- Caché persistente del clima y último dato disponible ---

def _client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_weather_is_persisted_and_survives_memory_loss(app_client):
    from app.data.catalog import get_municipality
    from app.services.weather import service
    m = get_municipality("or-oruro")
    calls = {"n": 0}
    inner = mock_transport()

    def counting(req):
        calls["n"] += 1
        return inner.handle_request(req)
    service.set_client(_client(counting))
    service.get_weather(m, "real", date(2026, 11, 21))
    first = calls["n"]
    service.cache.clear()  # simula un reinicio del servidor: se pierde la memoria, queda la base de datos
    w = service.get_weather(m, "real", date(2026, 11, 21))
    assert calls["n"] == first and w["forecast"]["available"]


def test_provider_failure_serves_last_good_forecast_marked_stale(app_client, monkeypatch):
    from app.data.catalog import get_municipality
    from app.services.weather import service
    m = get_municipality("or-oruro")
    service.set_client(_client(mock_transport().handle_request))
    service.get_weather(m, "real", date(2026, 11, 21))
    # Todo vence y el proveedor empieza a fallar (límite diario)
    from app import db as dbmod
    from app.models import WeatherCache
    with dbmod.SessionLocal() as s:
        for row in s.query(WeatherCache):
            row.expires_at = row.fetched_at
        s.commit()
    service.cache.clear()
    monkeypatch.setattr(service, "_client", _client(mock_transport(open_meteo="limit").handle_request))
    w = service.get_weather(m, "real", date(2026, 11, 21))
    f = w["forecast"]
    assert f["available"] and f["extra"]["stale"] is True
    assert "límite" in f["extra"]["error_now"] and f["extra"]["stale_fetched_at"].endswith("Z")


def test_stale_forecast_drops_past_days_and_old_data_is_not_used(app_client):
    from datetime import datetime, timedelta

    from app import db as dbmod
    from app.data.catalog import get_municipality
    from app.models import WeatherCache
    from app.services.weather import service
    m = get_municipality("or-oruro")
    service.set_client(_client(mock_transport().handle_request))
    service.get_weather(m, "real")
    with dbmod.SessionLocal() as s:  # el dato guardado tiene más de 12 h: ya no sirve como respaldo
        for row in s.query(WeatherCache):
            row.fetched_at = datetime.utcnow() - timedelta(hours=13)
            row.expires_at = row.fetched_at
        s.commit()
    service.cache.clear()
    service._client = _client(mock_transport(open_meteo="limit").handle_request)
    assert service.get_weather(m, "real")["forecast"]["available"] is False


def test_open_meteo_paid_key_uses_customer_endpoint(monkeypatch):
    from app.core.config import get_settings
    from app.services.weather import open_meteo
    monkeypatch.setattr(get_settings(), "open_meteo_api_key", "clave-de-prueba")
    seen = {}

    def handler(req):
        seen["host"], seen["key"] = req.url.host, req.url.params.get("apikey")
        return mock_transport().handle_request(httpx.Request("GET", "https://api.open-meteo.com/v1/forecast"))
    open_meteo.fetch_forecast(-17.9, -67.1, _client(handler))
    assert seen == {"host": "customer-api.open-meteo.com", "key": "clave-de-prueba"}


# --- Ubicación por GPS ---

def test_locate_nearest_municipality_and_outside_bolivia(app_client):
    c = app_client
    r = c.get("/api/locate?lat=-18.91&lon=-66.78").json()
    assert r["municipality_id"] == "or-challapata" and r["distance_km"] < 5 and r["far"] is False
    assert c.get("/api/locate?lat=-34.6&lon=-58.4").status_code == 422  # Buenos Aires
    far = c.get("/api/locate?lat=-13.2&lon=-61.0").json()  # norte de Santa Cruz/Beni, lejos de los municipios cargados
    assert far["far"] is True and "calendario" in far["note"]


def test_weather_and_recommendation_with_gps(app_client):
    c = app_client
    w = c.get("/api/weather?lat=-18.95&lon=-66.70").json()
    assert w["location"]["gps"] is True and w["location"]["nearest_name"] == "Challapata" and w["location"]["lat"] == -18.95
    r = c.post("/api/recommendations", json={"lat": -18.95, "lon": -66.70, "crop": "quinua", "soil_moisture": "si", "irrigation": "secano"}).json()
    assert r["scenario_status"] == "implemented" and r["location"]["gps"] is True
    far = c.post("/api/recommendations", json={"lat": -13.2, "lon": -61.0, "crop": "maiz", "soil_moisture": "si", "irrigation": "secano"}).json()
    assert any("puede no aplicar" in n for n in far["notes"])
    assert c.post("/api/recommendations", json={"crop": "quinua", "soil_moisture": "si", "irrigation": "secano"}).status_code == 404


# --- Cuentas: cambio de clave, eliminación, clave temporal ---

def test_change_password(app_client):
    c = app_client
    h = register(c, "71234567", password="clave123")
    assert c.post("/api/auth/password", json={"current_password": "mala", "new_password": "nuevaClave9"}, headers=h).status_code == 401
    assert c.post("/api/auth/password", json={"current_password": "clave123", "new_password": "corta"}, headers=h).status_code == 422
    assert c.post("/api/auth/password", json={"current_password": "clave123", "new_password": "nuevaClave9"}, headers=h).status_code == 200
    assert c.post("/api/auth/login", json={"phone": "71234567", "password": "clave123"}).status_code == 401
    login(c, "71234567", "nuevaClave9")


def test_delete_account_removes_personal_data(app_client):
    from app import db as dbmod
    from app.models import User
    c = app_client
    h = register(c, "71234567", "Ana Choque")
    c.patch("/api/auth/me", json={"crops": ["papa"], "default_municipality_id": "or-oruro"}, headers=h)
    assert c.request("DELETE", "/api/auth/me", json={"password": "mala"}, headers=h).status_code == 401
    r = c.request("DELETE", "/api/auth/me", json={"password": "clave123"}, headers=h)
    assert r.status_code == 200
    assert c.post("/api/auth/login", json={"phone": "71234567", "password": "clave123"}).status_code == 401
    assert c.get("/api/auth/me", headers=h).status_code == 401
    with dbmod.SessionLocal() as s:
        u = s.query(User).filter(User.full_name == "Cuenta eliminada").one()
        assert u.phone.startswith("eliminado-") and not u.crop_interests and not u.whatsapp_opt_in and not u.is_active
    # El número queda libre para volver a registrarse
    register(c, "71234567", "Ana Choque")
    assert c.request("DELETE", "/api/auth/me", json={"password": "admin-test-123"}, headers=admin_headers(c)).status_code == 403


def test_admin_temporary_password_must_be_changed(app_client):
    c = app_client
    h = register(c, "71234567")
    uid = c.get("/api/auth/me", headers=h).json()["id"]
    assert c.post(f"/api/admin/users/{uid}/reset-password", headers=h).status_code == 403
    temp = c.post(f"/api/admin/users/{uid}/reset-password", headers=admin_headers(c)).json()["temporary_password"]
    assert len(temp) == 8 and not set(temp) & set("l1o0")
    assert c.post("/api/auth/login", json={"phone": "71234567", "password": "clave123"}).status_code == 401
    t = login(c, "71234567", temp)
    assert c.get("/api/auth/me", headers=t).json()["must_change_password"] is True
    assert c.get("/api/me/communities", headers=t).status_code == 403  # bloqueado hasta cambiarla
    assert c.post("/api/auth/password", json={"current_password": temp, "new_password": "miClaveNueva1"}, headers=t).status_code == 200
    assert c.get("/api/me/communities", headers=t).status_code == 200


# --- Modo producción y salud ---

def test_production_problems_detected():
    from app.core.config import Settings, production_problems
    bad = Settings(environment="production", secret_key="x" * 32, cors_origins="*", database_url="sqlite:///x.db",
                   
                   whatsapp_enabled=True, admin_password="123", seed_demo=True)
    bad.secret_key = "corta"  # simula una configuración recibida desde una variable débil
    errors, warnings = production_problems(bad)
    assert len(errors) == 4 and len(warnings) == 2
    good = Settings(environment="production", secret_key="x" * 40, cors_origins="https://agro.example",
                    database_url="postgresql://u:p@h/db", admin_password="unaClaveLarga1", seed_demo=False)
    assert production_problems(good) == ([], [])


def test_check_production_refuses_to_start(monkeypatch):
    from app.core import config
    monkeypatch.setattr(config.get_settings(), "environment", "production")
    monkeypatch.setattr(config.get_settings(), "secret_key", "corta")
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        config.check_production()
    monkeypatch.setattr(config.get_settings(), "environment", "development")
    config.check_production()  # en desarrollo no bloquea


def test_health_reports_database_and_hsts_in_production(app_client, monkeypatch):
    from app.core.config import get_settings
    r = app_client.get("/api/health").json()
    assert r["status"] == "ok" and r["database"] is True and r["whatsapp"] == "simulador"
    monkeypatch.setattr(get_settings(), "environment", "production")
    assert "max-age" in app_client.get("/api/health").headers["Strict-Transport-Security"]


# --- Estado de conversación persistente ---

def test_chat_state_is_stored_in_database(app_client):
    from app import db as dbmod
    from app.models import ChatState
    c = app_client
    assert "municipio" in c.post("/api/whatsapp/simulate", json={"text": "¿hay helada mañana?", "session_id": "s1"}).json()["replies"][0]
    with dbmod.SessionLocal() as s:
        assert "pending" in s.query(ChatState).one().data
    assert "Oruro" in c.post("/api/whatsapp/simulate", json={"text": "Oruro", "session_id": "s1"}).json()["replies"][0]
