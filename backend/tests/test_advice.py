"""Asesoría: directorio de técnicos, recursos externos y asistente con IA (Claude simulado)."""
import pytest

from tests.conftest import admin_headers, register

EXPERT = {"full_name": "Rosa Mamani", "specialty": "Sanidad vegetal en papa y quinua", "institution": "Asociación de prueba",
          "phone": "71112233", "crops": ["papa"], "departments": ["la-paz"], "consent": True, "verified": True}


def add_expert(c, **kw):
    r = c.post("/api/admin/experts", json={**EXPERT, **kw}, headers=admin_headers(c))
    assert r.status_code == 201, r.text
    return r.json()


def ask(c, question, municipality_id=None, crop=None):
    r = c.post("/api/assistant", json={"question": question, "municipality_id": municipality_id, "crop": crop})
    assert r.status_code == 200, r.text
    return r.json()


def test_resources_list_has_user_links_and_official_bolivian_sources(app_client):
    d = app_client.get("/api/resources").json()
    ids = {i["id"] for i in d["items"]}
    assert len(d["items"]) == 12 and {"onesoil", "senamhi", "iniaf", "fao", "plantwise", "croplife"} <= ids
    assert {i["id"] for i in d["items"] if i.get("official")} == {"senamhi", "iniaf"}
    assert all(i["url"].startswith("https://") for i in d["items"])


def test_admin_expert_validation_and_permissions(app_client):
    c = app_client
    farmer = register(c, "72223344")
    assert c.post("/api/admin/experts", json=EXPERT, headers=farmer).status_code == 403
    a = admin_headers(c)
    assert c.post("/api/admin/experts", json={**EXPERT, "consent": False}, headers=a).status_code == 422
    assert c.post("/api/admin/experts", json={**EXPERT, "phone": "", "email": ""}, headers=a).status_code == 422
    assert c.post("/api/admin/experts", json={**EXPERT, "crops": ["trigo"]}, headers=a).status_code == 422
    assert c.post("/api/admin/experts", json={**EXPERT, "phone": "123"}, headers=a).status_code == 422
    e = add_expert(c)
    assert e["phone"] == "+59171112233" and e["whatsapp_url"] == "https://wa.me/59171112233"


def test_experts_are_matched_by_zone_and_crop(app_client):
    c = app_client
    add_expert(c)  # La Paz, papa
    add_expert(c, full_name="Juan Quispe", specialty="Suelos y riego", crops=[], departments=[], phone="72223355")  # todo el país
    add_expert(c, full_name="Ana Flores", specialty="Maíz", crops=["maiz"], departments=["santa-cruz"], phone="73334455")
    r = ask(c, "Las hojas de mi papa tienen manchas", "lp-el-alto")
    names = [e["full_name"] for e in r["experts"]]
    assert names[0] == "Rosa Mamani" and "Juan Quispe" in names and "Ana Flores" not in names
    assert r["crop"] == "papa" and "plagas" in r["topics"]
    r2 = ask(c, "¿Cuándo siembro maíz?", "sc-montero")
    assert {e["full_name"] for e in r2["experts"]} == {"Ana Flores", "Juan Quispe"}


def test_retired_and_demo_experts_are_not_shown_in_production(app_client, monkeypatch):
    from app import db as dbmod
    from app.core.config import get_settings
    from app.models import Expert
    c = app_client
    e = add_expert(c)
    c.post(f"/api/admin/experts/{e['id']}/deactivate", headers=admin_headers(c))
    with dbmod.SessionLocal() as s:
        s.add(Expert(full_name="Demo", specialty="x", phone="+59170000003", consent=True, is_demo=True))
        s.commit()
    monkeypatch.setattr(get_settings(), "seed_demo", False)
    assert c.get("/api/experts").json() == []


def test_basic_mode_without_api_key_recommends_resources(app_client):
    r = ask(app_client, "Tengo una plaga de gusanos en mi maíz")
    assert r["mode"] == "basico" and r["ai_available"] is False
    ids = [x["id"] for x in r["resources"]]
    assert ids[0] in ("croplife", "agrologica", "plantwise", "agromatica") and "iniaf" in ids
    assert "Todavía no hay técnicos" in r["answer"]
    clima = ask(app_client, "¿Va a caer helada esta semana?", "or-oruro")
    assert "senamhi" in [x["id"] for x in clima["resources"]]


def test_ai_answer_uses_groq_and_never_sees_phone_numbers(app_client, fake_groq):
    add_expert(app_client)
    fake_groq.reply("Respuesta de prueba de la IA.")
    r = ask(app_client, "Mi papa tiene manchas", "lp-el-alto")
    assert r["mode"] == "ia" and r["answer"] == "Respuesta de prueba de la IA." and r["ai_available"] is True
    call = fake_groq.calls[0]
    assert call["url"].startswith("https://api.groq.com/") and call["headers"]["Authorization"] == "Bearer gsk_prueba"
    prompt = call["json"]["messages"][-1]["content"]
    assert "Rosa Mamani" in prompt and "71112233" not in prompt and "+591" not in prompt
    assert "dosis" in call["json"]["messages"][0]["content"]


def test_ai_error_falls_back_to_basic(app_client, fake_groq):
    fake_groq.error(401, "Invalid API Key")
    assert ask(app_client, "hay helada?")["mode"] == "basico"
    assert ask(app_client, "hay helada?")["mode"] == "basico"  # sin respuestas: error de red


def test_assistant_input_validation(app_client):
    assert app_client.post("/api/assistant", json={"question": "a"}).status_code == 422
    assert app_client.post("/api/assistant", json={"question": "x" * 501}).status_code == 422
