"""Configuración central. Todos los valores sensibles vienen de variables de entorno."""
import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./agrobolivia.db"
    environment: str = "development"
    secret_key: str = "dev-only-insecure-key-change-me"
    token_expire_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:5173"

    admin_phone: str = "+59170000000"
    admin_password: str = ""
    seed_demo: bool = True

    open_meteo_url: str = "https://api.open-meteo.com/v1/forecast"
    nasa_power_url: str = "https://power.larc.nasa.gov/api/temporal"
    weather_timeout_seconds: float = 12.0

    whatsapp_enabled: bool = False
    whatsapp_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_verify_token: str = ""
    whatsapp_app_secret: str = ""
    whatsapp_api_version: str = "v21.0"

    frontend_dist: str = "../frontend/dist"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


def validate_runtime_settings(settings: Settings | None = None) -> None:
    """Impide iniciar en producción con credenciales inseguras o cuentas demo activas."""
    current = settings or get_settings()
    is_platform_production = bool(os.getenv("VERCEL") or os.getenv("RENDER"))
    if current.environment.strip().lower() in {"prod", "production"} or is_platform_production:
        if current.secret_key == "dev-only-insecure-key-change-me" or len(current.secret_key) < 32:
            raise RuntimeError("SECRET_KEY debe contener al menos 32 caracteres aleatorios en producción.")
        if not current.admin_password or len(current.admin_password) < 12:
            raise RuntimeError("ADMIN_PASSWORD debe tener al menos 12 caracteres en producción.")
        if current.seed_demo:
            raise RuntimeError("SEED_DEMO debe ser false en producción para no crear cuentas públicas conocidas.")
