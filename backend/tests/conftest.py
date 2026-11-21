import json
import os
import sys
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SEED_DEMO"] = "false"
os.environ["ADMIN_PHONE"] = "+59170000099"
os.environ["ADMIN_PASSWORD"] = "admin-test-123"
os.environ["SECRET_KEY"] = "test-secret-for-agrobolivia-tests-32chars"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def fixture(name):
    return json.loads((FIX / name).read_text())


def mock_transport(open_meteo="ok", nasa="ok"):
    """Simula Open-Meteo y NASA POWER. Valores: 'ok', 'limit', 'down', o un dict de respuesta."""
    def handler(request: httpx.Request):
        host = request.url.host
        if "open-meteo" in host:
            if open_meteo == "down":
                raise httpx.ConnectError("sin red")
            if open_meteo == "limit":
                return httpx.Response(429, json={"error": True, "reason": "Daily API request limit exceeded."})
            return httpx.Response(200, json=open_meteo if isinstance(open_meteo, dict) else fixture("open_meteo_oruro.json"))
        if "nasa" in host:
            if nasa == "down":
                raise httpx.ConnectError("sin red")
            if "climatology" in request.url.path:
                return httpx.Response(200, json=fixture("nasa_climatology_oruro.json"))
            return httpx.Response(200, json=fixture("nasa_daily_oruro.json"))
        return httpx.Response(404)
    return httpx.MockTransport(handler)


@pytest.fixture
def app_client():
    from app import db as dbmod
    from app.core.ratelimit import chat_limiter, login_limiter, register_limiter
    from app.main import app
    from app.services.weather import service
    from app.services.whatsapp import assistant

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    dbmod.engine = engine
    dbmod.SessionLocal.configure(bind=engine)
    service.set_client(httpx.Client(transport=mock_transport()))
    for lim in (login_limiter, register_limiter, chat_limiter):
        lim.reset()
    assistant.reset_state()
    with TestClient(app) as c:
        yield c
    service.set_client(None)


def register(c, phone, name="Juan Mamani", password="clave123", opt_in=True):
    r = c.post("/api/auth/register", json={"full_name": name, "phone": phone, "password": password, "whatsapp_opt_in": opt_in})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def login(c, phone, password):
    r = c.post("/api/auth/login", json={"phone": phone, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def admin_headers(c):
    return login(c, "+59170000099", "admin-test-123")
