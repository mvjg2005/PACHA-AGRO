"""Funciones adaptadas del proyecto PACHAAGRO: avisos regionales segmentados, cultivos de interés,
rol de editor, biblioteca, fuente oficial de clima, estados de WhatsApp y migración mínima."""
import hashlib
import hmac
import json
from datetime import datetime, timedelta

import httpx
import pytest

from app.services.audience import AudienceContext, notice_matches
from tests.conftest import admin_headers, mock_transport, register

NOTICE = {"title": "Aviso de prueba regional", "summary": "Resumen del aviso de prueba"}


def editor(c, phone="75550001"):
    h = register(c, phone, "Edith Condori")
    uid = c.get("/api/auth/me", headers=h).json()["id"]
    assert c.post(f"/api/admin/users/{uid}/role", json={"role": "editor"}, headers=admin_headers(c)).status_code == 200
    return h


# --- Segmentación (portada de lib/announcements-audience.ts) ---

@pytest.mark.parametrize("scope,dept,muni,crop,ctx,expected", [
    ("nacional", None, None, None, AudienceContext(), True),
    ("departamento", "oruro", None, None, AudienceContext("oruro", "or-oruro"), True),
    ("departamento", "oruro", None, None, AudienceContext("la-paz", "lp-el-alto"), False),
    ("departamento", "oruro", None, None, AudienceContext(), False),
    ("municipio", "oruro", "or-challapata", None, AudienceContext("oruro", "or-challapata"), True),
    ("municipio", "oruro", "or-challapata", None, AudienceContext("oruro", "or-oruro"), False),
    ("cultivo", None, None, "papa", AudienceContext(crops=["papa", "quinua"]), True),
    ("cultivo", None, None, "papa", AudienceContext(crops=["quinua"]), False),
    ("desconocido", None, None, None, AudienceContext(), False),
])
def test_notice_matches(scope, dept, muni, crop, ctx, expected):
    assert notice_matches(scope, dept, muni, crop, ctx) is expected


# --- Avisos regionales ---

def test_farmer_cannot_publish_and_admin_cannot_be_granted_by_api(app_client):
    c = app_client
    h = register(c, "71234567")
    assert c.post("/api/notices", json=NOTICE, headers=h).status_code == 403
    uid = c.get("/api/auth/me", headers=h).json()["id"]
    assert c.post(f"/api/admin/users/{uid}/role", json={"role": "admin"}, headers=admin_headers(c)).status_code == 422
    assert c.post(f"/api/admin/users/{uid}/role", json={"role": "editor"}, headers=h).status_code == 403


def test_editor_publishes_and_scope_is_validated(app_client):
    c = app_client
    h = editor(c)
    assert c.post("/api/notices", json={**NOTICE, "scope": "municipio", "municipality_id": "or-oruro", "department_id": "la-paz"}, headers=h).status_code == 422
    assert c.post("/api/notices", json={**NOTICE, "scope": "cultivo", "crop_id": "trigo"}, headers=h).status_code == 422
    assert c.post("/api/notices", json={**NOTICE, "scope": "departamento"}, headers=h).status_code == 422
    past = (datetime.now() - timedelta(days=1)).isoformat()
    assert c.post("/api/notices", json={**NOTICE, "expires_at": past}, headers=h).status_code == 422
    r = c.post("/api/notices", json={**NOTICE, "scope": "municipio", "municipality_id": "or-challapata", "kind": "clima"}, headers=h)
    assert r.status_code == 201
    out = r.json()
    assert out["department_id"] == "oruro" and out["scope_label"].startswith("Municipio de Challapata")
    assert "No es un aviso oficial" in out["disclaimer"] and out["author_role"] == "Editor de contenido"


def test_public_listing_filters_by_location_and_crops(app_client):
    c = app_client
    h = editor(c)
    for body in ({**NOTICE, "title": "Nacional uno"}, {**NOTICE, "title": "Solo Oruro", "scope": "departamento", "department_id": "oruro"},
                 {**NOTICE, "title": "Solo La Paz", "scope": "departamento", "department_id": "la-paz"},
                 {**NOTICE, "title": "Solo papa", "scope": "cultivo", "crop_id": "papa"}):
        assert c.post("/api/notices", json=body, headers=h).status_code == 201
    titles = lambda q: {n["title"] for n in c.get(f"/api/notices{q}").json()}  # noqa: E731
    assert titles("") == {"Nacional uno", "Solo Oruro", "Solo La Paz", "Solo papa"}
    assert titles("?municipality_id=or-challapata") == {"Nacional uno", "Solo Oruro"}
    assert titles("?municipality_id=or-challapata&crops=papa") == {"Nacional uno", "Solo Oruro", "Solo papa"}
    # "mine" usa la ubicación y los cultivos del perfil
    farmer = register(c, "72222222")
    c.patch("/api/auth/me", json={"default_municipality_id": "lp-el-alto", "crops": ["papa"]}, headers=farmer)
    mine = {n["title"] for n in c.get("/api/notices?mine=true", headers=farmer).json()}
    assert mine == {"Nacional uno", "Solo La Paz", "Solo papa"}


def test_expired_and_archived_notices_are_hidden(app_client):
    from app import db as dbmod
    from app.models import RegionalNotice
    c = app_client
    h = editor(c)
    nid = c.post("/api/notices", json=NOTICE, headers=h).json()["id"]
    with dbmod.SessionLocal() as s:
        s.get(RegionalNotice, nid).expires_at = datetime.now() - timedelta(minutes=1)
        s.commit()
    assert c.get("/api/notices").json() == []
    nid2 = c.post("/api/notices", json=NOTICE, headers=h).json()["id"]
    assert c.post(f"/api/notices/{nid2}/archive", headers=h).status_code == 200
    assert c.get("/api/notices").json() == []


def test_notify_is_simulated_and_targets_only_opted_in_matching_users(app_client):
    c = app_client
    h = editor(c)
    a = register(c, "72000001", "Ana Mamani", opt_in=True)
    b = register(c, "72000002", "Bruno Quispe", opt_in=True)
    d = register(c, "72000003", "Dora Flores", opt_in=False)
    c.patch("/api/auth/me", json={"default_municipality_id": "or-challapata"}, headers=a)
    c.patch("/api/auth/me", json={"default_municipality_id": "lp-el-alto"}, headers=b)
    c.patch("/api/auth/me", json={"default_municipality_id": "or-oruro"}, headers=d)
    nid = c.post("/api/notices", json={**NOTICE, "scope": "departamento", "department_id": "oruro"}, headers=h).json()["id"]
    r = c.post(f"/api/notices/{nid}/notify", headers=h).json()
    assert r["recipients"] == 1 and r["connected"] is False and "SIMULADOR" in r["message"]
    inbox = c.get("/api/whatsapp/inbox", headers=a).json()
    assert inbox[0]["template"] == "aviso_regional" and "no oficial" in inbox[0]["body"] and "BAJA" in inbox[0]["body"]
    assert c.get("/api/whatsapp/inbox", headers=b).json() == []


def test_profile_crops_validation(app_client):
    c = app_client
    h = register(c, "71234567")
    assert c.patch("/api/auth/me", json={"crops": ["quinua", "papa", "quinua"]}, headers=h).json()["crops"] == ["quinua", "papa"]
    assert c.patch("/api/auth/me", json={"crops": ["trigo"]}, headers=h).status_code == 422


# --- Biblioteca ---

def test_library_filters_and_sources(app_client):
    c = app_client
    lib = c.get("/api/education/library").json()
    assert lib["total"] == len(lib["items"]) == 8 and "PACHAAGRO" in lib["source_project"]
    assert all(i["source_note"] for i in lib["items"])
    papa = c.get("/api/education/library?crop=papa").json()["items"]
    assert any(i["crop"] == "papa" for i in papa) and all(i["crop"] in (None, "papa") for i in papa)
    assert {i["type"] for i in c.get("/api/education/library?type=cultivo").json()["items"]} == {"cultivo"}
    assert c.get("/api/education/library/ficha-cultivo-quinua").json()["crop"] == "quinua"
    assert c.get("/api/education/library/no-existe").status_code == 404
    # La lista de idiomas no confunde la biblioteca con un idioma
    assert {l["code"] for l in c.get("/api/education?lang=es").json()["available_languages"]} == {"es", "qu", "ay"}


# --- Fuente oficial de clima (portada de services/weather/official.ts) ---

OFFICIAL_OK = {"source": {"name": "Servicio oficial de prueba", "url": "https://example.org", "official": True},
               "current": {"temperature_c": 5.0, "weather_code": 2},
               "daily": [{"date": "2026-11-21", "temp_min_c": -3.0, "temp_max_c": 17.0, "precipitation_mm": 1.0, "weather_code": 95}]}


def _official_client(payload):
    inner = mock_transport()

    def handler(request):
        if request.url.host == "oficial.test":
            return payload(request) if callable(payload) else httpx.Response(200, json=payload)
        return inner.handle_request(request)
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_official_source_is_preferred_when_configured(monkeypatch):
    from app.core.config import get_settings
    from app.data.catalog import get_municipality
    from app.services.weather import service
    monkeypatch.setattr(get_settings(), "official_weather_url", "https://oficial.test/api")
    seen = {}

    def ok(request):
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json=OFFICIAL_OK)
    monkeypatch.setattr(get_settings(), "official_weather_key", "k1")
    service.set_client(_official_client(ok))
    w = service.get_weather(get_municipality("or-oruro"), "real")
    assert w["forecast"]["source"] == "Servicio oficial de prueba" and w["forecast"]["extra"]["official"] is True
    assert w["frost_risk"]["min_tmin"] == -3.0 and w["storm_risk"]["level"] == "posible"
    assert seen["auth"] == "Bearer k1"
    service.set_client(None)


def test_official_source_bad_format_falls_back_to_open_meteo(monkeypatch):
    from app.core.config import get_settings
    from app.data.catalog import get_municipality
    from app.services.weather import service
    monkeypatch.setattr(get_settings(), "official_weather_url", "https://oficial.test/api")
    service.set_client(_official_client({"daily": "basura"}))
    w = service.get_weather(get_municipality("or-oruro"), "real")
    assert w["forecast"]["available"] and "Open-Meteo" in w["forecast"]["source"]
    assert "formato no reconocido" in w["forecast"]["extra"]["fallback_from"][0]
    service.set_client(None)


def test_official_source_not_used_when_not_configured():
    from app.data.catalog import get_municipality
    from app.services.weather import service

    def boom(request):
        if request.url.host == "oficial.test":
            raise AssertionError("no debe llamarse")
        return mock_transport().handle_request(request)
    service.set_client(httpx.Client(transport=httpx.MockTransport(boom)))
    assert "Open-Meteo" in service.get_weather(get_municipality("or-oruro"), "real")["forecast"]["source"]
    service.set_client(None)


# --- Estados de WhatsApp por webhook ---

def _signed(c, payload):
    body = json.dumps(payload).encode()
    sig = "sha256=" + hmac.new(b"shh", body, hashlib.sha256).hexdigest()
    return c.post("/api/whatsapp/webhook", content=body, headers={"X-Hub-Signature-256": sig, "Content-Type": "application/json"})


def test_webhook_updates_delivery_status_without_going_back(app_client, monkeypatch):
    from app import db as dbmod
    from app.core.config import get_settings
    from app.models import OutboundMessage
    c = app_client
    monkeypatch.setattr(get_settings(), "whatsapp_enabled", True)
    monkeypatch.setattr(get_settings(), "whatsapp_app_secret", "shh")
    register(c, "71234567")
    with dbmod.SessionLocal() as s:
        s.add(OutboundMessage(user_id=1, template="aviso_regional", body="x", channel="whatsapp_cloud_api", status="enviado", wa_message_id="wamid.1"))
        s.commit()
    st = lambda status: {"entry": [{"changes": [{"value": {"statuses": [{"id": "wamid.1", "status": status}]}}]}]}  # noqa: E731
    assert _signed(c, st("read")).json()["statuses"] == 1
    _signed(c, st("delivered"))  # llega tarde: no debe retroceder
    with dbmod.SessionLocal() as s:
        assert s.query(OutboundMessage).one().status == "leido"
    r = _signed(c, {"entry": [{"changes": [{"value": {"statuses": [{"id": "wamid.1", "status": "failed", "errors": [{"title": "Número no válido"}]}]}}]}]})
    assert r.status_code == 200
    with dbmod.SessionLocal() as s:
        m = s.query(OutboundMessage).one()
        assert m.status == "fallido" and m.error == "Número no válido"
    assert _signed(c, {"entry": [{"changes": [{"value": {"statuses": [{"id": "desconocido", "status": "read"}]}}]}]}).json()["statuses"] == 0


def test_template_contracts_include_opt_out(app_client):
    t = app_client.get("/api/whatsapp/templates").json()
    assert {x["name"] for x in t} == {"recordatorio_reunion", "aviso_regional"} and all("BAJA" in x["body"] for x in t)


# --- WhatsApp: comandos nuevos ---

def chat(c, text, h=None):
    return c.post("/api/whatsapp/simulate", json={"text": text, "session_id": "p"}, headers=h or {}).json()["replies"][0]


def test_whatsapp_notices_guides_and_location_ack(app_client):
    c = app_client
    h = editor(c)
    c.post("/api/notices", json={**NOTICE, "title": "Helada en Oruro", "scope": "departamento", "department_id": "oruro"}, headers=h)
    assert "Listo, usaré Challapata" in chat(c, "Challapata")
    r = chat(c, "AVISOS")
    assert "Helada en Oruro" in r and "No son avisos oficiales" in r
    assert "Ficha de cultivo: quinua" in chat(c, "guias de quinua")


# --- Migración mínima para bases ya desplegadas ---

def test_ensure_columns_adds_missing_columns_idempotently(tmp_path):
    from sqlalchemy import create_engine, inspect, text

    from app.db import ensure_columns
    eng = create_engine(f"sqlite:///{tmp_path}/old.db")
    with eng.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, full_name VARCHAR(120))"))
        conn.execute(text("CREATE TABLE outbound_messages (id INTEGER PRIMARY KEY, status VARCHAR(20))"))
        conn.execute(text("INSERT INTO users (id, full_name) VALUES (1, 'Ana')"))
    added = ensure_columns(eng)
    assert "users.crop_interests" in added and "outbound_messages.wa_message_id" in added
    assert ensure_columns(eng) == []
    cols = {c["name"] for c in inspect(eng).get_columns("users")}
    assert "crop_interests" in cols and "token_version" in cols
    with eng.connect() as conn:
        assert conn.execute(text("SELECT full_name FROM users")).scalar() == "Ana"


def test_demo_notices_hidden_when_seed_demo_disabled(app_client, monkeypatch):
    from app import db as dbmod
    from app.core.config import get_settings
    from app.models import RegionalNotice
    c = app_client
    h = editor(c)
    c.post("/api/notices", json={**NOTICE, "title": "Aviso real"}, headers=h)
    with dbmod.SessionLocal() as s:
        s.add(RegionalNotice(title="Ejemplo DEMO", summary="ficticio", scope="nacional", author_id=1, is_demo=True))
        s.commit()
    monkeypatch.setattr(get_settings(), "seed_demo", True)
    assert {n["title"] for n in c.get("/api/notices").json()} == {"Aviso real", "Ejemplo DEMO"}
    monkeypatch.setattr(get_settings(), "seed_demo", False)
    assert {n["title"] for n in c.get("/api/notices").json()} == {"Aviso real"}
