import copy
import json
import os
import sys
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SEED_DEMO"] = "false"
os.environ["ADMIN_PHONE"] = "+59170000099"
os.environ["ADMIN_PASSWORD"] = "admin-test-123"
os.environ["SECRET_KEY"] = "test-secret"
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
    from app.routers.field import diagnosis_limiter
    from app.routers.senas import sena_limiter
    for lim in (login_limiter, register_limiter, chat_limiter, diagnosis_limiter, sena_limiter):
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


class FakeGroq:
    """Cliente HTTP simulado para Groq: guarda las solicitudes y devuelve las respuestas en cola."""

    def __init__(self):
        self.calls: list[dict] = []
        self.responses: list = []
        self.models: list[str] = []  # lo que devuelve GET /models

    def reply(self, text: str):
        self.responses.append(httpx.Response(200, json={"choices": [{"message": {"content": text}}]}))

    def error(self, status: int, message: str = "error"):
        self.responses.append(httpx.Response(status, json={"error": {"message": message}}))

    def client(self, **kw):
        fake = self

        class _C:
            def __enter__(self): return self
            def __exit__(self, *a): return False

            def get(self, url, headers):
                fake.calls.append({"url": url, "get": True})
                return httpx.Response(200, json={"data": [{"id": m, "active": True} for m in fake.models]})

            def post(self, url, json, headers):
                fake.calls.append({"url": url, "json": copy.deepcopy(json), "headers": headers})
                if not fake.responses:
                    raise httpx.ConnectError("sin respuestas simuladas")
                r = fake.responses.pop(0)
                if isinstance(r, Exception):
                    raise r
                return r
        return _C()


@pytest.fixture
def fake_groq(monkeypatch):
    from app.core.config import get_settings
    from app.services import agent
    monkeypatch.setattr(get_settings(), "groq_api_key", "gsk_prueba")
    monkeypatch.setattr(agent.time, "sleep", lambda s: None)
    fake = FakeGroq()
    monkeypatch.setattr(agent.httpx, "Client", fake.client)
    monkeypatch.setattr(agent, "MODEL_OVERRIDE", {"text": None, "vision": None})
    return fake
