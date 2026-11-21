"""Funciones de fecha y hora para la zona horaria oficial de Bolivia.

Bolivia usa UTC-4 sin cambio estacional. Se utiliza un offset fijo para que
el código funcione también en Windows, donde zoneinfo puede no tener tzdata.
Los horarios de reuniones/observaciones son naive y representan hora local;
las marcas internas de creación se almacenan en UTC naive.
"""
from datetime import date, datetime, timedelta, timezone

BOLIVIA_TZ = timezone(timedelta(hours=-4), name="America/La_Paz")


def local_now() -> datetime:
    return datetime.now(BOLIVIA_TZ).replace(tzinfo=None)


def local_today() -> date:
    return datetime.now(BOLIVIA_TZ).date()


def to_local_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(BOLIVIA_TZ).replace(tzinfo=None)
