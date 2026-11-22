"""Pacha IA: agente por voz y texto (integrado desde el prototipo de Antigravity)."""

import httpx
import pytest

from tests.conftest import register


def chat(c, message, **kw):
    r = c.post("/api/ai/agent/chat", json={"message": message, **kw})
    assert r.status_code == 200, r.text
    return r.json()


def test_status_and_local_greeting(app_client):
    s = app_client.get("/api/ai/agent/status").json()
    assert s["agent_name"] == "Pacha IA" and s["provider"] == "local"
    d = chat(app_client, "Hola")
    assert d["provider"] == "local" and "Pacha IA" in d["reply"] and "¿Cómo está usted?" in d["reply"]
    assert d["location"]["id"] == "or-challapata"  # municipio por defecto válido
    assert "**" not in d["speech_text"] and "Pacha IA" in d["speech_text"]


def test_location_from_message_and_real_weather(app_client):
    d = chat(app_client, "¿Cómo está el clima en Uyuni?")
    assert d["location"]["name"] == "Uyuni"
    assert "mínima" in d["reply"] and "SENAMHI" in d["reply"]  # datos del pronóstico (fixture), no texto inventado
    d2 = chat(app_client, "¿Hay riesgo de helada?", municipality_id="or-challapata")
    assert "riesgo de helada es" in d2["reply"]


def test_weather_unavailable_is_said_honestly(app_client):
    from app.services.weather import service
    service.clear_cache()
    service.set_client(httpx.Client(transport=httpx.MockTransport(lambda r: (_ for _ in ()).throw(httpx.ConnectError("sin red")))))
    d = chat(app_client, "¿Cómo está el clima hoy?", municipality_id="lp-el-alto")
    assert "no está disponible" in d["reply"]


def test_meetings_for_member(app_client):
    c = app_client
    h = register(c, "71280001")
    d = c.post("/api/ai/agent/chat", json={"message": "¿Cuándo es la reunión de mi comunidad?"}, headers=h).json()
    assert "Comunidad" in d["reply"]


def test_history_is_alternated_and_trimmed():
    from app.services.agent import _history
    h = [{"role": "assistant", "content": "bienvenida"}, {"role": "user", "content": "a"}, {"role": "user", "content": "b"},
         {"role": "assistant", "content": "c"}, {"role": "system", "content": "x"}, {"role": "user", "content": "actual"}]
    out = _history(h)
    assert out[0] == {"role": "user", "content": "a\nb"} and out[-1]["role"] == "assistant" and len(out) == 2


def test_groq_receives_real_context_without_phone_numbers(app_client, fake_groq):
    fake_groq.reply("Respuesta con **dato clave**.\n- uno")
    d = chat(app_client, "Mi papa tiene manchas", municipality_id="or-challapata",
             history=[{"role": "user", "content": "hola"}, {"role": "assistant", "content": "¡Hola!"}])
    assert d["provider"] == "groq" and d["sources"][0] == "Pacha IA (Groq)" and d["speech_text"] == "Respuesta con dato clave. uno"
    call = fake_groq.calls[0]
    assert call["url"] == "https://api.groq.com/openai/v1/chat/completions" and call["headers"]["Authorization"] == "Bearer gsk_prueba"
    msgs = call["json"]["messages"]
    assert msgs[0]["role"] == "system" and msgs[1] == {"role": "user", "content": "hola"}
    assert "Challapata" in msgs[-1]["content"] and "Clima (estimaciones)" in msgs[-1]["content"] and "+591" not in msgs[-1]["content"]


def test_microphone_allowed_for_voice(app_client):
    assert "microphone=(self)" in app_client.get("/api/health").headers["Permissions-Policy"]


@pytest.mark.parametrize("msg", ["", "x" * 1001])
def test_validation(app_client, msg):
    assert app_client.post("/api/ai/agent/chat", json={"message": msg}).status_code == 422


@pytest.mark.parametrize("msg,expected", [
    ("hola te amo", "cariño"),
    ("hola hola como estas", "muy bien, gracias por preguntar"),
    ("gracias", "Con mucho gusto"),
    ("chau", "Hasta pronto"),
    ("¿eres humano?", "no una persona"),
    ("hola, ¿va a helar?", "riesgo de helada es"),
])
def test_local_engine_converses_naturally(app_client, msg, expected):
    d = chat(app_client, msg, municipality_id="or-challapata")
    assert expected in d["reply"], d["reply"]


def test_repeated_greeting_is_short(app_client):
    d = chat(app_client, "hola", history=[{"role": "user", "content": "hola"}, {"role": "assistant", "content": "¡Hola!"}])
    assert d["reply"].startswith("¡Hola de nuevo")


def test_questions_to_pacha_and_no_repetition(app_client):
    h = []
    replies = []
    for q in ["Todo bien?", "O sea tu estas bien ?"]:
        d = chat(app_client, q, municipality_id="or-oruro", history=h)
        replies.append(d["reply"])
        h += [{"role": "user", "content": q}, {"role": "assistant", "content": d["reply"]}]
    assert all("gracias" in r.lower() for r in replies)  # responde que está bien, no «¡Qué bueno!»
    assert replies[0] != replies[1]
    d = chat(app_client, "estoy bien", municipality_id="or-oruro")
    assert "Me alegra" in d["reply"]


def test_groq_error_explained_without_leaking_key(app_client, fake_groq):
    fake_groq.error(400, "model llama-x decommissioned. key gsk_prueba")
    d = chat(app_client, "hola")
    assert d["provider"] == "local" and "400" in d["ai_error"] and "GROQ_MODEL" in d["ai_error"] and "gsk_prueba" not in d["ai_error"]
    st = app_client.get("/api/ai/agent/status").json()
    assert st["provider"] == "groq" and "400" in st["last_error"] and "gsk_prueba" not in str(st)


def test_groq_retries_when_overloaded(app_client, fake_groq):
    fake_groq.error(503, "overloaded"); fake_groq.error(503, "overloaded"); fake_groq.reply("¡Hola! Aquí estoy.")
    d = chat(app_client, "hola")
    assert d["provider"] == "groq" and len(fake_groq.calls) == 3 and d["ai_error"] is None


def test_groq_invalid_key_does_not_retry(app_client, fake_groq):
    fake_groq.error(401, "Invalid API Key")
    assert chat(app_client, "hola")["provider"] == "local" and len(fake_groq.calls) == 1


def test_groq_key_accepted_in_old_xai_variable(app_client, monkeypatch):
    from app.core.config import get_settings
    from app.services import agent
    monkeypatch.setattr(get_settings(), "xai_api_key", "gsk_clavedegroq123")
    st = app_client.get("/api/ai/agent/status").json()
    assert st["provider"] == "groq" and st["backup"] == [] and st["key_hint"]["groq"].startswith("gsk_")
    assert "clavedegroq" not in str(st) and agent.provider_keys()["groq"] == "gsk_clavedegroq123"


def test_no_paid_providers_remain():
    from app.core.config import get_settings
    s = get_settings()
    assert not any(hasattr(s, k) for k in ("anthropic_api_key", "gemini_api_key", "xai_model"))


def test_time_budget_falls_back_to_local_quickly(app_client, monkeypatch):
    from app.core.config import get_settings
    from app.services import agent
    monkeypatch.setattr(get_settings(), "groq_api_key", "gsk_x")
    monkeypatch.setattr(agent, "AI_BUDGET_S", 0)
    monkeypatch.setattr(agent.httpx, "Client", lambda **kw: (_ for _ in ()).throw(AssertionError("no debe llamar a la IA")))
    d = chat(app_client, "hola")
    assert d["provider"] == "local" and "tiempo" in d["ai_error"]


def test_retired_model_is_replaced_automatically(app_client, fake_groq):
    from app.services import agent
    fake_groq.models = ["whisper-large-v3", "llama-guard-4-12b", "openai/gpt-oss-120b", "meta-llama/llama-4-scout-17b-16e-instruct"]
    fake_groq.error(404, "The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.")
    fake_groq.reply("¡Hola! Ya funciono con otro modelo.")
    d = chat(app_client, "hola")
    assert d["provider"] == "groq" and d["ai_error"] is None
    posts = [c for c in fake_groq.calls if not c.get("get")]
    assert posts[0]["json"]["model"] == "llama-3.3-70b-versatile" and posts[1]["json"]["model"] == "openai/gpt-oss-120b"
    st = app_client.get("/api/ai/agent/status").json()
    assert st["model"] == "openai/gpt-oss-120b" and "openai/gpt-oss-120b" in st["models_available"]
    # Las siguientes consultas usan directamente el modelo elegido
    fake_groq.reply("Otra respuesta")
    chat(app_client, "gracias por todo")
    assert fake_groq.calls[-1]["json"]["model"] == "openai/gpt-oss-120b"
    assert agent.choose_model(fake_groq.models, "vision") == "meta-llama/llama-4-scout-17b-16e-instruct"


def test_choose_model_preferences():
    from app.services.agent import choose_model
    assert choose_model(["qwen/qwen3-32b", "llama-3.1-8b-instant", "llama-3.3-70b-versatile"], "text") == "llama-3.3-70b-versatile"
    assert choose_model(["whisper-large-v3", "playai-tts"], "text") is None
    assert choose_model(["llama-3.1-8b-instant"], "vision") is None
