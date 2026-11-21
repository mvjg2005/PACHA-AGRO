"""Configuración central. Todos los valores sensibles vienen de variables de entorno."""
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./agrobolivia.db"
    secret_key: str = Field(min_length=32)
    token_expire_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:5173"

    admin_phone: str = "+59170000000"
    admin_password: str = ""
    seed_demo: bool = False

    open_meteo_url: str = "https://api.open-meteo.com/v1/forecast"
    nasa_power_url: str = "https://power.larc.nasa.gov/api/temporal"
    weather_timeout_seconds: float = 12.0

    whatsapp_enabled: bool = False
    whatsapp_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_verify_token: str = ""
    whatsapp_app_secret: str = ""
    whatsapp_api_version: str = "v21.0"
    whatsapp_template_meeting: str = ""
    whatsapp_template_notice: str = ""

    # Fuente meteorológica oficial con contrato normalizado (p. ej. un servicio de SENAMHI habilitado).
    # No existe una API pública documentada: solo se usa si se configura. Ver docs/FUENTES_DATOS.md.
    official_weather_url: str = ""
    official_weather_key: str = ""

    frontend_dist: str = "../frontend/dist"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
