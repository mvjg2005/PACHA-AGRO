"""Pruebas de API: registro, inicio de sesión, permisos, reuniones, observaciones, WhatsApp y seguridad."""
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

import pytest

from tests.conftest import admin_headers, register

FUTURE = (datetime.now() + timedelta(days=2)).replace(microsecond=0).isoformat()


def make_community(c, rep_phone="71111111"):
    """Crea una comunidad aprobada con un representante. Devuelve (id, headers_rep)."""
    rep = register(c, rep_phone, "Rosa Quispe")
    r = c.post("/api/communities", json={"name": "Comunidad Prueba", "municipality_id": "or-challapata"}, headers=rep)
    assert r.status_code == 201 and r.json()["status"] == "pending"
    cid = r.json()["id"]
    assert c.post(f"/api/admin/communities/{cid}/approve", headers=admin_headers(c)).status_code == 200
    return cid, rep


def join_and_approve(c, cid, rep, phone="72222222", name="Juan Mamani"):
    h = register(c, phone, name)
    assert c.post(f"/api/communities/{cid}/join", headers=h).status_code == 201
    req = c.get(f"/api/communities/{cid}/requests", headers=rep).json()
    mid = next(x["id"] for x in req if x["user_name"] == name)
    assert c.post(f"/api/memberships/{mid}/approve", headers=rep).status_code == 200
    return h


# --- Registro e inicio de sesión ---

def test_register_login_me(app_client):
    c = app_client
    h = register(c, "7123 4567")
    me = c.get("/api/auth/me", headers=h).json()
    assert me["phone"] == "+59171234567" and me["role"] == "farmer"
    assert c.post("/api/auth/login", json={"phone": "71234567", "password": "clave123"}).status_code == 200


def test_register_validation_messages(app_client):
    r = app_client.post("/api/auth/register", json={"full_name": "J", "phone": "123", "password": "1"})
    assert r.status_code == 422
    fields = {e["field"] for e in r.json()["errors"]}
    assert {"full_name", "phone", "password"} <= fields


def test_duplicate_phone(app_client):
    register(app_client, "71234567")
    r = app_client.post("/api/auth/register", json={"full_name": "Otra Persona", "phone": "71234567", "password": "clave123"})
    assert r.status_code == 409


def test_wrong_password_and_rate_limit(app_client):
    register(app_client, "71234567")
    codes = [app_client.post("/api/auth/login", json={"phone": "71234567", "password": "mala"}).status_code for _ in range(9)]
    assert codes[0] == 401 and codes[-1] == 429


def test_invalid_token_rejected(app_client):
    assert app_client.get("/api/auth/me", headers={"Authorization": "Bearer xxx"}).status_code == 401


def test_password_not_stored_in_plain_text(app_client):
    from app import db as dbmod
    from app.models import User
    register(app_client, "71234567", password="secreta99")
    with dbmod.SessionLocal() as s:
        u = s.query(User).filter_by(phone="+59171234567").one()
        assert "secreta99" not in u.password_hash and u.password_hash.startswith("pbkdf2_sha256$")


# --- Comunidades y permisos ---

def test_pending_community_not_listed_until_admin_approves(app_client):
    c = app_client
    rep = register(c, "71111111", "Rosa Quispe")
    cid = c.post("/api/communities", json={"name": "Nueva", "municipality_id": "or-oruro"}, headers=rep).json()["id"]
    assert c.get("/api/communities").json() == []
    # El solicitante aún no puede crear reuniones
    assert c.post(f"/api/communities/{cid}/meetings", json={"title": "X reunión", "place": "Sede", "starts_at": FUTURE}, headers=rep).status_code == 404
    c.post(f"/api/admin/communities/{cid}/approve", headers=admin_headers(c))
    lst = c.get("/api/communities?department_id=oruro").json()
    assert len(lst) == 1 and lst[0]["representatives"] == ["Rosa Quispe"]


def test_farmer_cannot_approve_communities(app_client):
    h = register(app_client, "71234567")
    assert app_client.get("/api/admin/communities", headers=h).status_code == 403


def test_member_cannot_create_meeting_or_notice(app_client):
    c = app_client
    cid, rep = make_community(c)
    farmer = join_and_approve(c, cid, rep)
    assert c.post(f"/api/communities/{cid}/meetings", json={"title": "Falsa", "place": "x lugar", "starts_at": FUTURE}, headers=farmer).status_code == 403
    assert c.post(f"/api/communities/{cid}/notices", json={"title": "Aviso falso", "body": "texto"}, headers=farmer).status_code == 403


def test_non_member_cannot_read_community_content(app_client):
    c = app_client
    cid, _ = make_community(c)
    outsider = register(c, "73333333", "Persona Externa")
    for path in ("meetings", "notices", "observations", "activity"):
        assert c.get(f"/api/communities/{cid}/{path}", headers=outsider).status_code == 403
    pending = register(c, "74444444", "Pendiente Uno")
    c.post(f"/api/communities/{cid}/join", headers=pending)
    assert c.get(f"/api/communities/{cid}/meetings", headers=pending).status_code == 403


def test_representative_of_other_community_cannot_act(app_client):
    c = app_client
    cid, _ = make_community(c)
    rep2 = register(c, "75555555", "Otro Representante")
    cid2 = c.post("/api/communities", json={"name": "Otra", "municipality_id": "or-oruro"}, headers=rep2).json()["id"]
    c.post(f"/api/admin/communities/{cid2}/approve", headers=admin_headers(c))
    assert c.post(f"/api/communities/{cid}/meetings", json={"title": "Intrusa", "place": "x lugar", "starts_at": FUTURE}, headers=rep2).status_code == 403


def test_member_cannot_self_promote_or_approve_others(app_client):
    c = app_client
    cid, rep = make_community(c)
    farmer = join_and_approve(c, cid, rep)
    other = register(c, "76666666", "Tercera Persona")
    c.post(f"/api/communities/{cid}/join", headers=other)
    assert c.get(f"/api/communities/{cid}/requests", headers=farmer).status_code == 403
    assert c.post("/api/admin/memberships/1/role", json={"role": "representative"}, headers=farmer).status_code == 403


# --- Reuniones ---

def test_meeting_flow_and_attendance(app_client):
    c = app_client
    cid, rep = make_community(c)
    farmer = join_and_approve(c, cid, rep)
    r = c.post(f"/api/communities/{cid}/meetings", json={"title": "Asamblea de siembra", "place": "Sede", "starts_at": FUTURE}, headers=rep)
    assert r.status_code == 201
    mid = r.json()["id"]
    lst = c.get(f"/api/communities/{cid}/meetings", headers=farmer).json()
    assert lst[0]["title"] == "Asamblea de siembra"
    r = c.post(f"/api/meetings/{mid}/attendance", json={"response": "si"}, headers=farmer)
    assert r.json()["attendance"]["si"] == 1 and r.json()["my_response"] == "si"
    r = c.post(f"/api/meetings/{mid}/attendance", json={"response": "no"}, headers=farmer)
    assert r.json()["attendance"] == {"si": 0, "no": 1, "tal_vez": 0}
    assert c.get(f"/api/meetings/{mid}/attendance", headers=farmer).status_code == 403
    assert len(c.get(f"/api/meetings/{mid}/attendance", headers=rep).json()) == 1
    hist = c.get(f"/api/communities/{cid}/activity", headers=farmer).json()
    assert any(a["action"] == "reunion_creada" for a in hist)


def test_meeting_in_past_rejected(app_client):
    c = app_client
    cid, rep = make_community(c)
    past = (datetime.now() - timedelta(days=1)).isoformat()
    assert c.post(f"/api/communities/{cid}/meetings", json={"title": "Pasada", "place": "Sede", "starts_at": past}, headers=rep).status_code == 422


def test_reminders_are_simulated_and_respect_opt_in(app_client):
    c = app_client
    cid, rep = make_community(c)
    join_and_approve(c, cid, rep, "72222222", "Con Whatsapp")
    no_wa = register(c, "77777777", "Sin Whatsapp", opt_in=False)
    c.post(f"/api/communities/{cid}/join", headers=no_wa)
    mid = c.post(f"/api/communities/{cid}/meetings", json={"title": "Asamblea", "place": "Sede", "starts_at": FUTURE}, headers=rep).json()["id"]
    r = c.post(f"/api/meetings/{mid}/remind", headers=rep).json()
    assert r["connected"] is False and r["channel"] == "simulador"
    assert r["recipients"] == 2  # representante + miembro con opt-in; el pendiente sin opt-in no


# --- Observaciones ---

def test_observations_are_labeled_community_not_official(app_client):
    c = app_client
    cid, rep = make_community(c)
    farmer = join_and_approve(c, cid, rep)
    r = c.post(f"/api/communities/{cid}/observations", json={"kind": "granizo", "description": "Cayó fuerte"}, headers=farmer)
    assert r.status_code == 201 and "No es un aviso oficial" in r.json()["label"]
    obs = c.get(f"/api/communities/{cid}/observations", headers=farmer).json()
    assert obs[0]["label"].startswith("Observación comunitaria") and obs[0]["review_status"] == "sin_revisar"
    assert c.post(f"/api/observations/{obs[0]['id']}/review", json={"status": "confirmada"}, headers=farmer).status_code == 403
    assert c.post(f"/api/observations/{obs[0]['id']}/review", json={"status": "confirmada"}, headers=rep).status_code == 200
    # El reporte de granizo aparece en la recomendación como dato comunitario
    rec = c.post("/api/recommendations", json={"municipality_id": "or-challapata", "crop": "quinua", "soil_moisture": "si", "irrigation": "secano"}).json()
    storm = next(x for x in rec["criteria"] if x["id"] == "tormenta")
    assert storm["data_kind"] == "comunidad"


def test_observation_spam_limit(app_client):
    c = app_client
    cid, rep = make_community(c)
    farmer = join_and_approve(c, cid, rep)
    codes = [c.post(f"/api/communities/{cid}/observations", json={"kind": "helada"}, headers=farmer).status_code for _ in range(6)]
    assert codes[:5] == [201] * 5 and codes[5] == 429


# --- Recomendaciones y clima (API pública, sin registro) ---

def test_public_weather_and_recommendation_without_login(app_client):
    c = app_client
    assert c.get("/api/weather?municipality_id=or-oruro").status_code == 200
    r = c.post("/api/recommendations", json={"municipality_id": "or-oruro", "crop": "quinua", "variety": "Pandela", "soil_moisture": "si", "irrigation": "secano"})
    assert r.status_code == 200 and r.json()["status"] in ("verde", "amarillo", "rojo", "gris")


def test_recommendation_input_validation(app_client):
    c = app_client
    assert c.post("/api/recommendations", json={"municipality_id": "nope", "crop": "quinua", "soil_moisture": "si", "irrigation": "secano"}).status_code == 404
    assert c.post("/api/recommendations", json={"municipality_id": "or-oruro", "crop": "trigo", "soil_moisture": "si", "irrigation": "secano"}).status_code == 422
    assert c.post("/api/recommendations", json={"municipality_id": "or-oruro", "crop": "quinua", "variety": "<script>", "soil_moisture": "si", "irrigation": "secano"}).status_code == 422
    assert c.post("/api/recommendations", json={"municipality_id": "or-oruro", "crop": "quinua", "soil_moisture": "mucho", "irrigation": "secano"}).status_code == 422


def test_all_nine_departments_available(app_client):
    deps = app_client.get("/api/locations").json()["departments"]
    assert {d["name"] for d in deps} == {"La Paz", "Oruro", "Potosí", "Cochabamba", "Santa Cruz", "Chuquisaca", "Tarija", "Beni", "Pando"}


def test_education_and_pending_languages(app_client):
    r = app_client.get("/api/education?lang=es").json()
    assert len(r["lessons"]) >= 7 and all(l["sources"] for l in r["lessons"])
    langs = {l["code"]: l for l in r["available_languages"]}
    assert langs["qu"]["status"] == "pendiente" and langs["ay"]["lessons"] == 0
    assert app_client.get("/api/education?lang=../etc").status_code == 422


# --- WhatsApp ---

def chat(c, text, h=None):
    return c.post("/api/whatsapp/simulate", json={"text": text, "session_id": "t"}, headers=h or {}).json()["replies"]


def test_whatsapp_status_is_simulator(app_client):
    s = app_client.get("/api/whatsapp/status").json()
    assert s["connected"] is False and "SIMULADOR" in s["message"]


def test_whatsapp_weather_asks_location_then_answers(app_client):
    c = app_client
    assert "municipio" in chat(c, "¿Hay riesgo de helada mañana?")[0]
    reply = chat(c, "Oruro")[0]
    assert "Oruro" in reply and "Fuente" in reply


def test_whatsapp_sowing_query(app_client):
    c = app_client
    reply = chat(c, "¿Cuándo puedo sembrar quinua en Challapata?")[0]
    assert "Quinua en Challapata" in reply


def test_whatsapp_meeting_confirm_and_report(app_client):
    c = app_client
    cid, rep = make_community(c)
    farmer = join_and_approve(c, cid, rep)
    mid = c.post(f"/api/communities/{cid}/meetings", json={"title": "Asamblea", "place": "Sede", "starts_at": FUTURE}, headers=rep).json()["id"]
    c.post(f"/api/meetings/{mid}/remind", headers=rep)
    assert "Recordatorio" in c.get("/api/whatsapp/inbox", headers=farmer).json()[0]["body"]
    assert "Asamblea" in chat(c, "¿Cuándo es la reunión de mi comunidad?", farmer)[0]
    assert "SÍ" in chat(c, "si", farmer)[0]
    m = c.get(f"/api/communities/{cid}/meetings", headers=farmer).json()[0]
    assert m["my_response"] == "si"
    assert "OBSERVACIÓN COMUNITARIA" in chat(c, "Quiero avisar que cayó granizo en mi zona.", farmer)[0]
    assert "registrado" in chat(c, "si", farmer)[0]
    obs = c.get(f"/api/communities/{cid}/observations", headers=farmer).json()
    assert obs[0]["kind"] == "granizo" and obs[0]["channel"] == "whatsapp_sim"


def test_whatsapp_report_requires_account(app_client):
    assert "cuenta" in chat(app_client, "cayó granizo")[0]


def test_whatsapp_opt_out(app_client):
    c = app_client
    h = register(c, "71234567")
    chat(c, "BAJA", h)
    assert c.get("/api/auth/me", headers=h).json()["whatsapp_opt_in"] is False


def test_webhook_disabled_without_credentials(app_client):
    assert app_client.post("/api/whatsapp/webhook", json={}).status_code == 503
    assert app_client.get("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1").status_code == 403


def test_webhook_signature_verification(app_client, monkeypatch):
    from app.core.config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "whatsapp_enabled", True)
    monkeypatch.setattr(s, "whatsapp_app_secret", "shh")
    body = json.dumps({"entry": [{"changes": [{"value": {"messages": [{
        "from": "59171234567",
        "timestamp": str(int(datetime.now(timezone.utc).timestamp())),
        "type": "text",
        "text": {"body": "hola"},
    }]}}]}]}).encode()
    bad = app_client.post("/api/whatsapp/webhook", content=body, headers={"X-Hub-Signature-256": "sha256=bad", "Content-Type": "application/json"})
    assert bad.status_code == 401
    malformed = b"{"
    malformed_sig = "sha256=" + hmac.new(b"shh", malformed, hashlib.sha256).hexdigest()
    malformed_response = app_client.post(
        "/api/whatsapp/webhook", content=malformed,
        headers={"X-Hub-Signature-256": malformed_sig, "Content-Type": "application/json"},
    )
    assert malformed_response.status_code == 400

    class FakeChannel:
        connected = True

        def send_text(self, to, text):
            return "simulado"

    monkeypatch.setattr("app.routers.whatsapp.get_channel", lambda: FakeChannel())
    sig = "sha256=" + hmac.new(b"shh", body, hashlib.sha256).hexdigest()
    ok = app_client.post(
        "/api/whatsapp/webhook", content=body,
        headers={"X-Hub-Signature-256": sig, "Content-Type": "application/json"},
    )
    assert ok.status_code == 200


def test_security_headers(app_client):
    r = app_client.get("/api/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff" and r.headers["X-Frame-Options"] == "DENY"
    assert r.json() == {"status": "ok", "database": "ok"}



def test_login_rate_limit_applies_to_ip_across_phone_numbers(app_client, monkeypatch):
    from app.core.ratelimit import login_ip_limiter

    monkeypatch.setattr(login_ip_limiter, "max_calls", 2)
    login_ip_limiter.reset()
    phones = ["71234567", "72234567", "73234567"]
    statuses = [
        app_client.post("/api/auth/login", json={"phone": phone, "password": "wrong"}).status_code
        for phone in phones
    ]
    assert statuses == [401, 401, 429]


def test_production_settings_reject_insecure_defaults():
    from app.core.config import Settings, validate_runtime_settings

    with pytest.raises(RuntimeError):
        validate_runtime_settings(Settings(environment="production"))
    validate_runtime_settings(Settings(
        environment="production",
        secret_key="s" * 48,
        admin_password="AdminSecurePassword2026!",
        seed_demo=False,
    ))


def test_whitespace_only_community_name_is_rejected(app_client):
    user = register(app_client, "78888888", "Persona Prueba")
    response = app_client.post(
        "/api/communities",
        json={"name": "   ", "municipality_id": "or-oruro"},
        headers=user,
    )
    assert response.status_code == 422


def test_whatsapp_yes_without_attendance_context_does_not_mark_next_meeting(app_client):
    c = app_client
    cid, rep = make_community(c)
    farmer = join_and_approve(c, cid, rep)
    created = c.post(
        f"/api/communities/{cid}/meetings",
        json={"title": "Asamblea futura", "place": "Sede", "starts_at": FUTURE},
        headers=rep,
    )
    assert created.status_code == 201
    reply = chat(c, "si", farmer)[0]
    assert "No encontré una reunión vigente" in reply
    meeting = c.get(f"/api/communities/{cid}/meetings", headers=farmer).json()[0]
    assert meeting["my_response"] is None


def test_whatsapp_meeting_question_binds_yes_to_that_meeting(app_client):
    c = app_client
    cid, rep = make_community(c)
    farmer = join_and_approve(c, cid, rep)
    created = c.post(
        f"/api/communities/{cid}/meetings",
        json={"title": "Asamblea futura", "place": "Sede", "starts_at": FUTURE},
        headers=rep,
    )
    assert created.status_code == 201
    assert "Asamblea futura" in chat(c, "¿Cuándo es la reunión de mi comunidad?", farmer)[0]
    assert "Registramos que SÍ" in chat(c, "si", farmer)[0]
    meeting = c.get(f"/api/communities/{cid}/meetings", headers=farmer).json()[0]
    assert meeting["my_response"] == "si"


def test_meeting_with_timezone_offset_is_normalized_to_bolivia(app_client):
    c = app_client
    cid, rep = make_community(c)
    starts_utc = datetime.now(timezone.utc) + timedelta(days=5)
    bolivia_offset = timezone(timedelta(hours=-4))
    local_expected = starts_utc.astimezone(bolivia_offset).replace(tzinfo=None)
    response = c.post(
        f"/api/communities/{cid}/meetings",
        json={"title": "Reunión con zona", "place": "Sede", "starts_at": starts_utc.isoformat()},
        headers=rep,
    )
    assert response.status_code == 201, response.text
    assert response.json()["starts_at"] == local_expected.isoformat(timespec="minutes") + "-04:00"



def test_demo_communities_are_hidden_even_when_id_is_known(app_client):
    from app import db as dbmod
    from app.models import Community, User

    headers = register(app_client, "79999991", "Persona Demo")
    with dbmod.SessionLocal() as db:
        user = db.scalar(select(User).where(User.phone == "+59179999991"))
        community = Community(
            name="Comunidad Demo Oculta",
            department_id="oruro",
            municipality_id="or-oruro",
            description="Solo para comprobar visibilidad",
            status="approved",
            is_demo=True,
            created_by=user.id,
        )
        db.add(community)
        db.commit()
        cid = community.id

    listed = app_client.get("/api/communities").json()
    assert all(row["id"] != cid for row in listed)
    assert app_client.get(f"/api/communities/{cid}", headers=headers).status_code == 404
    assert app_client.post(f"/api/communities/{cid}/join", headers=headers).status_code == 404


def test_whatsapp_webhook_ignores_messages_outside_24_hour_window(app_client, monkeypatch):
    import time
    from app.core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "whatsapp_enabled", True)
    monkeypatch.setattr(settings, "whatsapp_app_secret", "shh")

    class FakeChannel:
        connected = True
        def __init__(self):
            self.sent = []
        def send_text(self, to, text):
            self.sent.append((to, text))
            return "simulado"

    channel = FakeChannel()
    monkeypatch.setattr("app.routers.whatsapp.get_channel", lambda: channel)
    old_timestamp = str(int(time.time()) - 25 * 60 * 60)
    body = json.dumps({"entry": [{"changes": [{"value": {"messages": [{
        "from": "59171234567",
        "timestamp": old_timestamp,
        "type": "text",
        "text": {"body": "hola"},
    }]}}]}]}).encode()
    signature = "sha256=" + hmac.new(b"shh", body, hashlib.sha256).hexdigest()
    response = app_client.post(
        "/api/whatsapp/webhook", content=body,
        headers={"X-Hub-Signature-256": signature, "Content-Type": "application/json"},
    )
    assert response.status_code == 200
    assert channel.sent == []
