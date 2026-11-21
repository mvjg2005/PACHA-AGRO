from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.core.time import BOLIVIA_TZ, as_local_naive, local_now, local_today


def test_local_now_uses_bolivia_timezone_and_returns_naive_datetime():
    now = local_now()
    aware = datetime.now(ZoneInfo("America/La_Paz"))
    assert now.tzinfo is None
    assert now.date() == aware.date()
    assert abs((now - aware.replace(tzinfo=None)).total_seconds()) < 2
    assert BOLIVIA_TZ.key == "America/La_Paz"


def test_aware_datetime_is_converted_to_bolivia_wall_time():
    value = datetime(2026, 11, 21, 12, 0, tzinfo=timezone.utc)
    assert as_local_naive(value) == datetime(2026, 11, 21, 8, 0)


def test_naive_datetime_is_already_bolivia_wall_time():
    value = datetime(2026, 11, 21, 8, 0)
    assert as_local_naive(value) is value


def test_local_today_matches_bolivia_calendar_date():
    assert local_today() == datetime.now(ZoneInfo("America/La_Paz")).date()
