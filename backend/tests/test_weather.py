"""Fuentes meteorológicas y manejo de datos faltantes."""
from datetime import date, datetime, timedelta, timezone

import httpx

from app.data.catalog import get_municipality
from app.services.weather import metno, service
from app.services.weather.base import Block, DailyValue
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


def test_metno_parser_builds_daily_and_hourly_forecast():
    base = datetime(2026, 11, 21, 4, 0, tzinfo=timezone.utc)  # 00:00 en Bolivia
    series = []
    for i in range(8):  # 48 horas cada 6 h
        moment = base + timedelta(hours=6 * i)
        series.append({
            "time": moment.isoformat().replace("+00:00", "Z"),
            "data": {
                "instant": {"details": {"air_temperature": 10 + i, "relative_humidity": 60, "wind_speed": 2}},
                "next_6_hours": {"summary": {"symbol_code": "rain"}, "details": {"precipitation_amount": 1.5}},
            },
        })
    block = metno.parse_forecast({"properties": {"timeseries": series}}, TODAY)
    assert block.available and block.source == metno.SOURCE
    assert len(block.daily) == 2
    assert block.daily[0].tmin == 10 and block.daily[1].tmax == 17
    assert block.daily[0].weather_code == 61
    assert block.extra["hourly"] and block.extra["license"]


def test_open_meteo_limit_falls_back_to_metno(monkeypatch):
    fake = Block(
        available=True, source=metno.SOURCE, kind="pronostico",
        daily=[DailyValue(date=TODAY.isoformat(), tmin=5, tmax=18, precip_mm=1.0, weather_code=61)],
        extra={"license": metno.LICENSE},
    )
    monkeypatch.setattr(service.metno, "fetch_forecast", lambda *args, **kwargs: fake)
    use(open_meteo="limit")
    w = service.get_weather(M, "real", TODAY)
    assert w["forecast"]["available"] is True
    assert w["forecast"]["source"] == metno.SOURCE
    assert w["forecast"]["extra"]["fallback_from"]
