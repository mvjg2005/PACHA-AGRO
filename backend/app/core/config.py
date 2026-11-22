"""Configuración central. Todos los valores sensibles vienen de variables de entorno."""
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("xai_api_key", "groq_api_key", mode="before")
    @classmethod
    def clean_key(cls, v):
        """Quita espacios, comillas y un «Bearer » pegado por error al copiar la clave."""
        if not isinstance(v, str):
            return v
        v = v.strip().strip('"').strip("'").strip()
        return v[7:].strip() if v.lower().startswith("bearer ") else v

    environment: str = "development"  # development | production
    database_url: str = "sqlite:///./agrobolivia.db"
    secret_key: str = "dev-only-insecure-key-change-me"
    token_expire_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:5173"

    admin_phone: str = "+59170000000"
    admin_password: str = ""
    seed_demo: bool = True

    open_meteo_url: str = "https://api.open-meteo.com/v1/forecast"
    open_meteo_api_key: str = ""  # opcional: plan pagado de Open-Meteo
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

    # IA gratuita con Groq. Sin GROQ_API_KEY todo funciona en modo básico (sin IA).
    # Compatibilidad: una clave de Groq («gsk_») puesta antes en XAI_API_KEY también se acepta.
    xai_api_key: str = ""
    # Groq (groq.com, claves «gsk_»), con plan gratuito (opcional).
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    # Modelo de Groq que entiende imágenes (revisión de plantas por foto).
    groq_vision_model: str = "meta-llama/llama-4-scout-17b-16e-instruct"

    # Fuente meteorológica oficial con contrato normalizado (p. ej. un servicio de SENAMHI habilitado).
    # No existe una API pública documentada: solo se usa si se configura. Ver docs/FUENTES_DATOS.md.
    official_weather_url: str = ""
    official_weather_key: str = ""

    frontend_dist: str = "../frontend/dist"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


DEFAULT_SECRET = "dev-only-insecure-key-change-me"


def production_problems(s: "Settings") -> tuple[list[str], list[str]]:
    """Revisa la configuración para producción. Devuelve (errores que impiden arrancar, advertencias)."""
    errors, warnings = [], []
    if s.secret_key in (DEFAULT_SECRET, "cambie-esta-clave") or len(s.secret_key) < 32:
        errors.append("SECRET_KEY debe ser aleatoria y de al menos 32 caracteres.")
    if "*" in s.cors_list:
        errors.append("CORS_ORIGINS no puede ser '*' en producción.")
    if s.database_url.startswith("sqlite"):
        errors.append("Use PostgreSQL (DATABASE_URL): SQLite se borra en cada despliegue en la nube.")
    if s.whatsapp_enabled and not (s.whatsapp_token and s.whatsapp_phone_number_id and s.whatsapp_app_secret and s.whatsapp_verify_token):
        errors.append("WHATSAPP_ENABLED=true requiere WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET y WHATSAPP_VERIFY_TOKEN.")
    if s.admin_password and len(s.admin_password) < 10:
        warnings.append("ADMIN_PASSWORD es corta: use al menos 10 caracteres.")
    if s.seed_demo:
        warnings.append("SEED_DEMO=true en producción muestra cuentas y datos de demostración.")
    return errors, warnings


def check_production() -> None:
    import logging

    s = get_settings()
    if s.environment != "production":
        return
    errors, warnings = production_problems(s)
    log = logging.getLogger("agrobolivia")
    for w in warnings:
        log.warning("Configuración: %s", w)
    if errors:
        raise RuntimeError("Configuración insegura para producción:\n- " + "\n- ".join(errors))


@lru_cache
def get_settings() -> Settings:
    return Settings()
