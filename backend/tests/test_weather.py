"""Fuentes meteorológicas y manejo de datos faltantes."""
from datetime import date

import httpx

from app.data.catalog import get_municipality
from app.services.weather import service
from tests.conftest import mock_transport

M = get_municipality("or-oruro")
TODAY = date(2026, 11, 21)


def use(**kw):
    service.set_client(httpx.Client(transport=mock_transport(**kw)))


def test_all_sources_ok():
    use()
    w = service.get_weather(M, "real", TODAY)
    assert w["forecast"]["available"] and w["forecast"]["kind"] == "pronostico"
    assert len(w["forecast"]["daily"]) == 7
    assert w["forecast"]["soil_moisture"] == 0.22
    assert w["storm_risk"]["level"] == "posible"
    assert w["frost_risk"]["basis"] == "pronostico"
    # NASA: los días -999 (aún no publicados) se descartan
    assert w["recent"]["available"] and all(d["tmin"] != -999 for d in w["recent"]["daily"])
    assert w["climatology"]["frost_days_month"] == 3.0
    assert w["official_alerts"]["available"] is False


def test_open_meteo_rate_limited_falls_back_to_climatology():
    use(open_meteo="limit")
    w = service.get_weather(M, "real", TODAY)
    assert not w["forecast"]["available"]
    assert "límite" in w["forecast"]["error"]
    assert w["frost_risk"]["basis"] == "climatologia"


def test_all_sources_down():
    use(open_meteo="down", nasa="down")
    w = service.get_weather(M, "real", TODAY)
    assert not w["forecast"]["available"] and not w["recent"]["available"]
    assert w["frost_risk"]["level"] == "desconocido"


def test_simulated_mode_never_calls_network_and_is_labeled():
    def boom(request):
        raise AssertionError("no debe llamar a la red")
    service.set_client(httpx.Client(transport=httpx.MockTransport(boom)))
    w = service.get_weather(M, "simulado", TODAY)
    assert w["mode"] == "simulado" and w["forecast"]["kind"] == "simulado"
    assert "SIMULACI" in w["forecast"]["source"]


def test_cache_avoids_repeated_calls():
    calls = {"n": 0}
    inner = mock_transport()

    def counting(request):
        calls["n"] += 1
        return inner.handle_request(request)
    service.set_client(httpx.Client(transport=httpx.MockTransport(counting)))
    service.get_weather(M, "real", TODAY)
    first = calls["n"]
    service.get_weather(M, "real", TODAY)
    assert calls["n"] == first == 3


def test_climatology_fill_values_are_normalized_to_none():
    from app.services.weather.nasa_power import MONTHS, parse_climatology

    data = {
        "properties": {
            "parameter": {
                "FROST_DAYS": {month: -999 for month in MONTHS},
                "PRECTOTCORR": {month: -999 for month in MONTHS},
            }
        }
    }
    result = parse_climatology(data)
    assert result["frost_days"]["JAN"] is None
    assert result["precip_mm_day"]["JAN"] is None


def test_malformed_provider_payload_does_not_break_weather():
    use(open_meteo={"daily": "formato inesperado"})
    w = service.get_weather(M, "real", TODAY)
    assert w["forecast"]["available"] is False
    assert w["forecast"]["error"]
