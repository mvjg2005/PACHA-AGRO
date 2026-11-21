"""Pruebas del motor de recomendación (sin red, sin base de datos)."""
from datetime import date

import pytest

from app.data.catalog import crops_config, get_municipality
from app.services.recommendation.engine import Answers, WeatherView, evaluate

ORURO = get_municipality("or-challapata")
SC = get_municipality("sc-montero")
OCT = date(2026, 10, 10)  # dentro de la época óptima de quinua en Oruro


def wx(tmins, precip=None, storm_day=None, soil=0.25, available=True, mode="real", frost_days=None):
    precip = precip or [3.0] * len(tmins)
    daily = [{"date": f"2026-10-{10 + i}", "tmin": t, "tmax": t + 15, "precip_mm": p, "storm": i == storm_day}
             for i, (t, p) in enumerate(zip(tmins, precip))]
    return WeatherView(mode=mode, forecast_available=available, forecast_source="test", forecast_kind="pronostico",
                       daily=daily if available else [], soil_model=soil, soil_model_kind="open_meteo_m3m3", soil_model_source="test",
                       recent_daily=daily, recent_source="test-recent", frost_days_month=frost_days)


def run(w, moisture="si", irrigation="secano", crop="quinua", muni=ORURO, today=OCT):
    return evaluate(crops_config(), muni, Answers(crop, None, moisture, irrigation), w, today)


def test_favorable_conditions_green():
    r = run(wx([3, 4, 3, 5, 4, 3, 4]))
    assert r["status"] == "verde"
    assert r["scenario_status"] == "implemented"
    assert all(c["explanation"] for c in r["criteria"])


def test_strong_frost_is_red_and_explained():
    r = run(wx([3, -4, 2, 3, 3, 3, 3]))
    assert r["status"] == "rojo"
    frost = next(c for c in r["criteria"] if c["id"] == "helada")
    assert frost["status"] == "rojo" and "-4" in frost["explanation"]


def test_light_frost_is_yellow():
    r = run(wx([3, -1, 2, 3, 3, 3, 3]))
    assert r["status"] == "amarillo"


def test_dry_soil_rainfed_is_red():
    assert run(wx([3] * 7), moisture="no")["status"] == "rojo"


def test_dry_soil_with_irrigation_not_red():
    r = run(wx([3] * 7), moisture="no", irrigation="riego")
    assert r["status"] == "amarillo"


def test_unknown_moisture_uses_model_estimate():
    r = run(wx([3] * 7, soil=0.08), moisture="no_se")
    hum = next(c for c in r["criteria"] if c["id"] == "humedad")
    assert hum["status"] == "rojo" and hum["data_kind"] == "estimacion"


def test_unknown_moisture_without_model_is_insufficient():
    w = wx([3] * 7, soil=None)
    w.soil_model_kind = None
    assert run(w, moisture="no_se")["status"] == "gris"


def test_no_forecast_uses_climatology_and_caps_at_yellow():
    r = run(wx([3] * 7, available=False, frost_days=3), moisture="si")
    assert r["status"] == "amarillo"
    assert r["confidence"] == "baja"
    frost = next(c for c in r["criteria"] if c["id"] == "helada")
    assert frost["data_kind"] == "climatologia"


def test_no_forecast_no_climatology_is_insufficient():
    assert run(wx([3] * 7, available=False, frost_days=None))["status"] == "gris"


def test_outside_calendar_is_red():
    assert run(wx([3] * 7), today=date(2026, 3, 1))["status"] == "rojo"


def test_crop_without_rules_returns_insufficient_without_criteria():
    r = run(wx([3] * 7), crop="haba")
    assert r["status"] == "gris" and r["criteria"] == []


def test_quinoa_in_lowlands_has_no_rules():
    assert run(wx([20] * 7), muni=SC)["status"] == "gris"


def test_maize_santa_cruz_is_demo_and_window_crosses_year():
    r = run(wx([20] * 7, precip=[5] * 7), crop="maiz", muni=SC, today=date(2027, 1, 10))
    assert r["scenario_status"] == "demo"
    cal = next(c for c in r["criteria"] if c["id"] == "calendario")
    assert cal["status"] == "amarillo"  # dentro de la ventana nov-ene, fuera de la óptima


def test_storm_and_community_hail_reports_mark_caution():
    w = wx([3] * 7, storm_day=2)
    storm = next(c for c in run(w)["criteria"] if c["id"] == "tormenta")
    assert storm["status"] == "amarillo"
    w2 = wx([3] * 7)
    w2.community_hail_reports = 2
    storm2 = next(c for c in run(w2)["criteria"] if c["id"] == "tormenta")
    assert storm2["data_kind"] == "comunidad" and "no es aviso oficial" in storm2["explanation"]


def test_simulated_mode_is_labeled():
    r = run(wx([3] * 7, mode="simulado"))
    assert r["mode"] == "simulado" and r["confidence"] == "baja"
    assert any(c["data_kind"] == "simulado" for c in r["criteria"])


def test_weights_are_documented_and_sum_to_one():
    w = crops_config()["weights"]
    assert pytest.approx(sum(w.values())) == 1.0


# --- Factor decisivo, acción principal y explicación de confianza ---

def test_key_factor_is_frost_when_frost_is_red():
    r = run(wx([3, -4, 2, 3, 3, 3, 3]))
    assert r["key_factor"]["id"] == "helada" and r["key_factor"]["status"] == "rojo"
    assert r["main_action"].startswith("Espere")


def test_key_factor_prefers_critical_over_noncritical_at_same_status():
    # lluvia fuerte (no crítico, amarillo) y helada leve (crítico, amarillo): decide la helada
    r = run(wx([3, -1, 2, 3, 3, 3, 3], precip=[0, 30, 0, 0, 0, 0, 0]))
    assert r["key_factor"]["id"] == "helada"


def test_key_factor_red_beats_yellow_even_if_noncritical():
    r = run(wx([3, -1, 2, 3, 3, 3, 3], precip=[0] * 7), moisture="poca")
    reds = [c["id"] for c in r["criteria"] if c["status"] == "rojo"]
    assert reds == ["lluvia"] and r["key_factor"]["id"] == "lluvia"


def test_dry_soil_main_action_mentions_rain_or_irrigation():
    r = run(wx([3] * 7), moisture="no")
    assert r["key_factor"]["id"] == "humedad" and "riegue" in r["main_action"]


def test_late_vs_early_calendar_action():
    late = run(wx([3] * 7), today=date(2026, 11, 20))
    assert late["key_factor"]["id"] == "calendario" and "ya pasó" in late["main_action"]
    early = run(wx([3] * 7), today=date(2026, 9, 5))
    assert early["key_factor"]["id"] == "calendario" and "aún no empieza" in early["main_action"]


def test_green_result_has_positive_action_and_critical_key_factor():
    r = run(wx([3, 4, 3, 5, 4, 3, 4]))
    assert r["status"] == "verde" and r["key_factor"]["id"] in ("calendario", "helada", "humedad")
    assert r["main_action"].startswith("Puede preparar")


def test_missing_data_listed_and_action_when_insufficient():
    w = wx([3] * 7, soil=None)
    w.soil_model_kind = None
    r = run(w, moisture="no_se")
    assert r["status"] == "gris" and r["key_factor"]["id"] == "humedad"
    assert "Humedad del suelo" in r["missing_data"]
    assert "humedad" in r["main_action"]


def test_no_forecast_action_asks_to_check_again():
    r = run(wx([3] * 7, available=False, frost_days=3))
    assert r["key_factor"]["id"] == "helada" and "no hay pronóstico" in r["main_action"]
    assert "Lluvia próxima (7 días)" in r["missing_data"]
    assert r["confidence_explanation"].startswith("Baja: no hay pronóstico")


def test_confidence_explanation_says_it_is_not_a_probability():
    for r in (run(wx([3] * 7)), run(wx([3] * 7, mode="simulado"))):
        assert "no es la probabilidad" in r["confidence_explanation"]
    assert "simulados" in run(wx([3] * 7, mode="simulado"))["confidence_explanation"]
    assert "no están validadas" in run(wx([3] * 7))["confidence_explanation"]


def test_no_rules_crop_has_action_and_no_key_factor():
    r = run(wx([3] * 7), crop="haba")
    assert r["key_factor"] is None and "técnico" in r["main_action"]


def test_missing_rainfall_is_unknown_not_zero():
    w = wx([3] * 7)
    w.daily[2]["precip_mm"] = None
    r = run(w)
    rain = next(c for c in r["criteria"] if c["id"] == "lluvia")
    assert rain["status"] == "gris"
    assert "no contiene datos de lluvia" in rain["explanation"]


def test_confirmed_community_frost_report_marks_caution():
    w = wx([3] * 7)
    w.community_frost_reports = 1
    r = run(w)
    frost = next(c for c in r["criteria"] if c["id"] == "helada")
    assert frost["status"] == "amarillo"
    assert "reporte(s) comunitario(s)" in frost["explanation"]


def test_frost_reports_are_included_even_when_only_climatology_is_available():
    w = wx([3] * 7, available=False, frost_days=3)
    w.community_frost_reports = 2
    r = run(w)
    frost = next(c for c in r["criteria"] if c["id"] == "helada")
    assert frost["status"] == "amarillo"
    assert frost["data_kind"] == "climatologia"
    assert "reporte(s) comunitario(s)" in frost["explanation"]
