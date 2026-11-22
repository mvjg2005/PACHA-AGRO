"""Mi campo: diagnóstico por foto, fichas de cultivo, condiciones de pulverización y parcelas."""
import base64
import json
from datetime import datetime, timezone

import pytest

from tests.conftest import register

JPEG = base64.b64encode(b"\xff\xd8\xff\xe0" + b"\x10" * 4000).decode()


def diag(c, **kw):
    return c.post("/api/diagnosis", json={"image": JPEG, "media_type": "image/jpeg", **kw})


AI_BODY = {"is_plant": True, "image_quality": "buena", "summary": "Hojas con manchas oscuras.",
           "candidates": [{"name": "Tizón tardío", "kind": "hongo", "confidence": "media", "signs": "Manchas oscuras con borde claro"}] * 4
           + [{"name": "Raro", "kind": "inventado", "confidence": "segura", "signs": "x"}],
           "verify": ["Revise el envés"], "actions": ["Retire hojas afectadas"], "urgency": "altísima"}


def test_diagnosis_without_ai_offers_symptom_guide_and_does_not_store_photo(app_client):
    r = diag(app_client, crop="papa", municipality_id="lp-el-alto")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["mode"] == "guia" and d["result"] is None and d["ai_available"] is False
    assert len(d["guide"]) >= 6 and d["photo_stored"] is False
    assert {x["id"] for x in d["resources"]} == {"plantwise", "croplife", "iniaf"}
    assert app_client.get("/api/diagnosis/guide").json()["guide"][0]["first_steps"]


def test_diagnosis_rejects_invalid_images(app_client):
    c = app_client
    png_as_jpeg = base64.b64encode(b"\x89PNG" + b"0" * 4000).decode()
    assert c.post("/api/diagnosis", json={"image": png_as_jpeg, "media_type": "image/jpeg"}).status_code == 422
    assert c.post("/api/diagnosis", json={"image": "no-es-base64!!" * 20}).status_code == 422
    tiny = base64.b64encode(b"\xff\xd8\xff" + b"0" * 100).decode()
    assert c.post("/api/diagnosis", json={"image": tiny}).status_code == 422
    assert c.post("/api/diagnosis", json={"image": JPEG, "media_type": "image/gif"}).status_code == 422


def test_diagnosis_with_ai_sends_image_and_validates_output(app_client, fake_groq):
    from app.core.config import get_settings
    fake_groq.reply(json.dumps(AI_BODY))
    d = diag(app_client, crop="papa", notes="Apareció después de la lluvia").json()
    assert d["mode"] == "ia" and d["guide"] is None and d["ai_available"] is True
    cands = d["result"]["candidates"]
    assert len(cands) == 3 and cands[0]["kind_label"] == "Hongo" and d["result"]["urgency"] == "media"  # valor inválido corregido
    call = fake_groq.calls[0]["json"]
    assert call["model"] == get_settings().groq_vision_model and call["response_format"] == {"type": "json_object"}
    content = call["messages"][1]["content"]
    assert content[1]["image_url"]["url"].startswith("data:image/jpeg;base64,") and "Papa" in content[0]["text"]
    assert "dosis" in call["messages"][0]["content"]


def test_diagnosis_ai_bad_json_falls_back_to_guide(app_client, fake_groq):
    fake_groq.reply("esto no es json")
    assert diag(app_client).json()["mode"] == "guia"


def test_diagnosis_is_rate_limited(app_client):
    codes = [diag(app_client).status_code for _ in range(9)]
    assert codes[-1] == 429 and codes[0] == 200


def test_crop_sheets(app_client):
    c = app_client
    lst = c.get("/api/crops/sheets").json()
    assert {s["id"] for s in lst["sheets"]} == {"quinua", "papa", "maiz", "haba", "cebada"} and "INIAF" in lst["note"]
    s = c.get("/api/crops/sheets/quinua").json()
    assert s["growing"] and s["soil"] and s["problems"] and s["source_link"]["url"].startswith("https://")
    assert c.get("/api/crops/sheets/trigo").status_code == 404


def _series(start, n=30, wind=8.0, temp=15.0, rh=60.0, rain_at=None):
    from datetime import timedelta
    rows = []
    for i in range(n):
        t = start + timedelta(hours=i)
        rows.append({"time": t.strftime("%Y-%m-%dT%H:00"), "temperature_2m": temp, "relative_humidity_2m": rh,
                     "wind_speed_10m": wind, "wind_gusts_10m": wind + 5, "precipitation": 2.0 if rain_at == i else 0.0,
                     "precipitation_probability": 80 if rain_at == i else 10})
    return rows


def test_spray_conditions_rules():
    from app.services.weather.spray import BOLIVIA, spray_conditions
    start = datetime(2026, 11, 21, 8, tzinfo=BOLIVIA)
    now = start.astimezone(timezone.utc)
    ok = spray_conditions(_series(start), now)
    assert ok["status"] == "bueno" and ok["best_window"]["start"] == "2026-11-21T08:00"
    windy = spray_conditions(_series(start, wind=22), now)
    assert windy["status"] == "no" and "deriva" in windy["reasons"][0] and windy["best_window"] is None
    calm = spray_conditions(_series(start, wind=1), now)
    assert calm["status"] == "moderado" and "inversión" in calm["reasons"][0]
    rain = spray_conditions(_series(start, rain_at=2), now)
    assert rain["status"] == "no" and "lluvia" in rain["reasons"][0]
    hot = spray_conditions(_series(start, temp=33, rh=30), now)
    assert hot["status"] == "no"
    assert spray_conditions(None, now) is None


def test_weather_includes_spray_without_exposing_hourly_series(app_client):
    d = app_client.get("/api/weather?municipality_id=or-challapata").json()
    assert "hourly" not in d["forecast"]["extra"]
    assert "spray" in d  # el fixture no trae viento: no se calcula, pero la clave existe
    assert d["spray"] is None


def test_plots_crud_summary_and_privacy(app_client):
    c = app_client
    h = register(c, "71230001")
    other = register(c, "71230002", name="Otra Persona")
    assert c.get("/api/plots").status_code == 401
    assert c.post("/api/plots", json={"name": "Loma", "crop": "trigo"}, headers=h).status_code == 422
    assert c.post("/api/plots", json={"name": "Loma", "sowing_date": "2026-13-01"}, headers=h).status_code == 422
    p = c.post("/api/plots", json={"name": "Parcela de la loma", "crop": "papa", "area_ha": 0.5, "area_method": "gps",
                                   "municipality_id": "lp-el-alto"}, headers=h)
    assert p.status_code == 201, p.text
    pid = p.json()["id"]
    assert p.json()["crop_name"] == "Papa" and p.json()["municipality_name"].startswith("El Alto")
    rec = lambda **kw: c.post(f"/api/plots/{pid}/records", json=kw, headers=h)  # noqa: E731
    assert rec(date="2026-10-15", kind="siembra", description="Semilla Waycha", cost_bs=800).status_code == 201
    rec(date="2026-11-01", kind="fertilizacion", cost_bs=350.5)
    assert rec(date="2027-03-20", kind="cosecha", quantity=40, unit="l").status_code == 422
    rec(date="2027-03-20", kind="cosecha", quantity=40, unit="qq")
    d = rec(date="2027-03-25", kind="venta", quantity=40, unit="qq", cost_bs=6000).json()
    s = d["summary"]
    assert d["sowing_date"] == "2026-10-15"
    assert s["costs_bs"] == 1150.5 and s["income_bs"] == 6000 and s["balance_bs"] == 4849.5
    assert s["harvest_kg"] == 1840 and s["yield_kg_ha"] == 3680 and s["records"] == 4
    assert c.get(f"/api/plots/{pid}", headers=other).status_code == 404
    assert c.post(f"/api/plots/{pid}/records", json={"date": "2026-11-02", "kind": "riego"}, headers=other).status_code == 404
    assert len(c.get("/api/plots", headers=h).json()["plots"]) == 1 and c.get("/api/plots", headers=other).json()["plots"] == []
    rid = d["records"][0]["id"]
    assert c.delete(f"/api/plots/{pid}/records/{rid}", headers=other).status_code == 404
    assert c.delete(f"/api/plots/{pid}/records/{rid}", headers=h).json()["summary"]["records"] == 3
    upd = c.put(f"/api/plots/{pid}", json={"name": "Loma grande", "crop": "papa", "area_ha": 1}, headers=h).json()
    assert upd["name"] == "Loma grande" and upd["summary"]["yield_kg_ha"] == 1840


def test_deleting_account_removes_plots(app_client):
    from app import db as dbmod
    from app.models import FieldRecord, Plot
    c = app_client
    h = register(c, "71230003")
    pid = c.post("/api/plots", json={"name": "Huerto"}, headers=h).json()["id"]
    c.post(f"/api/plots/{pid}/records", json={"date": "2026-11-02", "kind": "riego"}, headers=h)
    assert c.request("DELETE", "/api/auth/me", json={"password": "clave123"}, headers=h).status_code == 200
    with dbmod.SessionLocal() as db:
        assert db.query(Plot).count() == 0 and db.query(FieldRecord).count() == 0


def test_retired_vision_model_switches_to_available_multimodal_model(app_client, fake_groq, monkeypatch):
    from app.services import agent
    monkeypatch.setattr(agent, "VISION_ERROR", {"groq": None})
    # Lista real de una cuenta gratuita sin Llama 4 Scout (noviembre de 2026)
    fake_groq.models = ["allam-2-7b", "meta-llama/llama-prompt-guard-2-22m", "openai/gpt-oss-120b", "openai/gpt-oss-20b",
                        "openai/gpt-oss-safeguard-20b", "qwen/qwen3.8-27b", "whisper-large-v3"]
    fake_groq.error(404, "The model `meta-llama/llama-4-scout-17b-16e-instruct` does not exist or you do not have access to it.")
    fake_groq.reply(json.dumps(AI_BODY))
    d = diag(app_client, crop="papa").json()
    assert d["mode"] == "ia"
    posts = [c for c in fake_groq.calls if not c.get("get")]
    assert posts[1]["json"]["model"] == "qwen/qwen3.8-27b"
    st = app_client.get("/api/ai/agent/status").json()
    assert st["vision_model"] == "qwen/qwen3.8-27b" and st["vision_error"] is None


def test_vision_error_does_not_mark_the_chat_as_broken(app_client, fake_groq, monkeypatch):
    from app.services import agent
    monkeypatch.setattr(agent, "VISION_ERROR", {"groq": None})
    monkeypatch.setattr(agent, "LAST_ERROR", {"groq": None})
    fake_groq.models = ["openai/gpt-oss-120b"]
    fake_groq.error(404, "The model `meta-llama/llama-4-scout-17b-16e-instruct` does not exist.")
    assert diag(app_client).json()["mode"] == "guia"
    st = app_client.get("/api/ai/agent/status").json()
    assert st["last_error"] is None and "GROQ_VISION_MODEL" in st["vision_error"]
