import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

PHONE_RE = re.compile(r"^\+591[67]\d{7}$")


def normalize_phone(v: str) -> str:
    v = re.sub(r"[\s\-()]", "", v)
    if re.fullmatch(r"[67]\d{7}", v):
        v = "+591" + v
    elif v.startswith("591"):
        v = "+" + v
    return v


class RegisterIn(BaseModel):
    full_name: str = Field(min_length=3, max_length=120)
    phone: str
    password: str = Field(min_length=6, max_length=128)
    whatsapp_opt_in: bool = False
    default_municipality_id: str | None = None

    @field_validator("full_name")
    @classmethod
    def clean_name(cls, v):
        v = " ".join(v.split())
        if not re.fullmatch(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .]{3,120}", v):
            raise ValueError("El nombre solo puede tener letras y espacios.")
        return v

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v):
        v = normalize_phone(v)
        if not PHONE_RE.match(v):
            raise ValueError("Escriba un número de celular de Bolivia de 8 dígitos (ej. 71234567).")
        return v


class LoginIn(BaseModel):
    phone: str
    password: str = Field(min_length=1, max_length=128)

    @field_validator("phone")
    @classmethod
    def norm(cls, v):
        return normalize_phone(v)


class UserOut(BaseModel):
    id: int
    full_name: str
    phone: str
    role: str
    is_demo: bool
    whatsapp_opt_in: bool
    default_municipality_id: str | None
    crops: list[str] = []
    must_change_password: bool = False

    model_config = {"from_attributes": True}


class PasswordChangeIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class DeleteAccountIn(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class ProfileUpdate(BaseModel):
    whatsapp_opt_in: bool | None = None
    default_municipality_id: str | None = None
    crops: list[str] | None = Field(default=None, max_length=10)


class RegionalNoticeIn(BaseModel):
    title: str = Field(min_length=5, max_length=140)
    summary: str = Field(min_length=5, max_length=300)
    body: str = Field(default="", max_length=3000)
    kind: Literal["aviso", "comunicado", "clima", "evento"] = "aviso"
    scope: Literal["nacional", "departamento", "municipio", "cultivo"] = "nacional"
    department_id: str | None = Field(default=None, max_length=40)
    municipality_id: str | None = Field(default=None, max_length=60)
    crop_id: str | None = Field(default=None, max_length=30)
    expires_at: datetime | None = None


class UserRoleIn(BaseModel):
    # No se puede asignar "admin" por la API (evita escalada de privilegios); el admin viene del entorno.
    role: Literal["farmer", "editor"]


class CommunityIn(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    municipality_id: str
    description: str = Field(default="", max_length=600)

    @field_validator("name")
    @classmethod
    def clean(cls, v):
        return " ".join(v.split())


class MeetingIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(default="", max_length=1000)
    place: str = Field(min_length=2, max_length=160)
    starts_at: datetime


class AttendanceIn(BaseModel):
    response: Literal["si", "no", "tal_vez"]


class NoticeIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    body: str = Field(min_length=3, max_length=1500)
    category: Literal["general", "clima", "reunion", "siembra"] = "general"


class ObservationIn(BaseModel):
    kind: Literal["helada", "granizo", "lluvia_fuerte", "sequia", "otro"]
    description: str = Field(default="", max_length=600)
    observed_at: datetime | None = None


class ReviewIn(BaseModel):
    status: Literal["confirmada", "descartada"]


class RoleIn(BaseModel):
    role: Literal["member", "representative"]


class RecommendationIn(BaseModel):
    municipality_id: str | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)
    crop: str
    variety: str | None = Field(default=None, max_length=80)
    soil_moisture: Literal["si", "poca", "no", "no_se"]
    irrigation: Literal["riego", "secano"]
    mode: Literal["real", "simulado"] = "real"


class ChatIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    session_id: str = Field(default="anon", max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


class ExpertIn(BaseModel):
    full_name: str = Field(min_length=3, max_length=120)
    specialty: str = Field(min_length=3, max_length=160)
    institution: str = Field(default="", max_length=160)
    phone: str = Field(default="", max_length=20)
    email: str = Field(default="", max_length=160)
    crops: list[str] = Field(default_factory=list, max_length=10)
    departments: list[str] = Field(default_factory=list, max_length=9)
    consent: bool
    verified: bool = False

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v):
        if not v:
            return v
        v = normalize_phone(v)
        if not PHONE_RE.match(v):
            raise ValueError("Escriba un celular de Bolivia de 8 dígitos (ej. 71234567).")
        return v

    @field_validator("email")
    @classmethod
    def check_email(cls, v):
        v = v.strip()
        if v and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
            raise ValueError("Correo no válido.")
        return v


class AssistantIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    municipality_id: str | None = Field(default=None, max_length=60)
    crop: str | None = Field(default=None, max_length=30)


class DiagnosisIn(BaseModel):
    image: str = Field(min_length=100, max_length=2_200_000)  # base64 (la foto no se guarda)
    media_type: Literal["image/jpeg", "image/png", "image/webp"] = "image/jpeg"
    crop: str | None = Field(default=None, max_length=30)
    municipality_id: str | None = Field(default=None, max_length=60)
    notes: str | None = Field(default=None, max_length=300)


DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _check_date(v: str | None) -> str | None:
    if v in (None, ""):
        return None
    if not DATE_RE.match(v):
        raise ValueError("Use una fecha válida (AAAA-MM-DD).")
    try:
        datetime.strptime(v, "%Y-%m-%d")
    except ValueError as e:
        raise ValueError("Use una fecha válida (AAAA-MM-DD).") from e
    return v


class PlotIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    crop: str = Field(default="", max_length=30)
    variety: str = Field(default="", max_length=60)
    area_ha: float | None = Field(default=None, gt=0, le=10000)
    area_method: Literal["manual", "gps"] = "manual"
    municipality_id: str | None = Field(default=None, max_length=60)
    sowing_date: str | None = None
    notes: str = Field(default="", max_length=500)

    @field_validator("name", "variety", "notes")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("sowing_date")
    @classmethod
    def date_ok(cls, v):
        return _check_date(v)


RECORD_KINDS = ("siembra", "riego", "fertilizacion", "control", "deshierbe", "aporque", "cosecha", "venta", "gasto", "observacion")


class RecordIn(BaseModel):
    date: str
    kind: Literal[RECORD_KINDS]  # type: ignore[valid-type]
    description: str = Field(default="", max_length=300)
    quantity: float | None = Field(default=None, ge=0, le=1_000_000)
    unit: Literal["", "kg", "qq", "arroba", "t", "l", "bolsa", "jornal", "hora"] = ""
    cost_bs: float | None = Field(default=None, ge=0, le=10_000_000)

    @field_validator("date")
    @classmethod
    def date_ok(cls, v):
        d = _check_date(v)
        if not d:
            raise ValueError("Indique la fecha.")
        return d
