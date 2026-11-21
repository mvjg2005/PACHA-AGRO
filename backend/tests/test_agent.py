"""Pacha IA: agente por voz y texto (integrado desde el prototipo de Antigravity)."""
from types import SimpleNamespace

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
    d = chat(app_client, "Hola, ¿cómo estás?")
    assert d["provider"] == "local" and "Pacha IA" in d["reply"]
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


class FakeAnthropic:
    calls: list = []

    def __init__(self, **kw):
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kw):
        FakeAnthropic.calls.append(kw)
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="Respuesta con **dato clave**.\n- uno")])


def test_claude_receives_real_context_without_phone_numbers(app_client, monkeypatch):
    import anthropic

    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "clave")
    monkeypatch.setattr(anthropic, "Anthropic", FakeAnthropic)
    FakeAnthropic.calls = []
    d = chat(app_client, "Mi papa tiene manchas", municipality_id="or-challapata",
             history=[{"role": "user", "content": "hola"}, {"role": "assistant", "content": "¡Hola!"}])
    assert d["provider"] == "claude" and d["speech_text"] == "Respuesta con dato clave. uno"
    call = FakeAnthropic.calls[0]
    assert call["fallbacks"] == "default" and call["messages"][0] == {"role": "user", "content": "hola"}
    last = call["messages"][-1]["content"]
    assert "Challapata" in last and "Clima (estimaciones)" in last and "+591" not in last


def test_gemini_used_when_only_gemini_key(app_client, monkeypatch):
    from app.core.config import get_settings
    from app.services import agent
    monkeypatch.setattr(get_settings(), "gemini_api_key", "g-clave")
    seen = {}

    class Client:
        def __init__(self, **kw): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False

        def post(self, url, json, headers):
            seen.update(url=url, headers=headers, body=json)
            return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "Hola desde Gemini"}]}}]})
    monkeypatch.setattr(agent.httpx, "Client", Client)
    d = chat(app_client, "hola")
    assert d["provider"] == "gemini" and d["reply"] == "Hola desde Gemini"
    assert "key=" not in seen["url"] and seen["headers"]["x-goog-api-key"] == "g-clave"


def test_microphone_allowed_for_voice(app_client):
    assert "microphone=(self)" in app_client.get("/api/health").headers["Permissions-Policy"]


@pytest.mark.parametrize("msg", ["", "x" * 1001])
def test_validation(app_client, msg):
    assert app_client.post("/api/ai/agent/chat", json={"message": msg}).status_code == 422
