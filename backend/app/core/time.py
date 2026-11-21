"""Reloj civil de Bolivia para agenda y formularios locales."""
from datetime import date, datetime
from zoneinfo import ZoneInfo

BOLIVIA_TZ = ZoneInfo("America/La_Paz")


def local_now() -> datetime:
    """Hora actual de Bolivia sin tzinfo para columnas DateTime naive de agenda."""
    return datetime.now(BOLIVIA_TZ).replace(tzinfo=None)


def local_today() -> date:
    """Fecha calendario actual de Bolivia."""
    return datetime.now(BOLIVIA_TZ).date()


def as_local_naive(value: datetime) -> datetime:
    """Interpreta valores naive como hora Bolivia y convierte valores aware a esa zona."""
    if value.tzinfo is None:
        return value
    return value.astimezone(BOLIVIA_TZ).replace(tzinfo=None)
