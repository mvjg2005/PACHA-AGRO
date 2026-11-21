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
    default_municipality_id: str | None = Field(default=None, max_length=60)

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
    phone: str = Field(max_length=32)
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

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    whatsapp_opt_in: bool | None = None
    default_municipality_id: str | None = None


class CommunityIn(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    municipality_id: str
    description: str = Field(default="", max_length=600)

    @field_validator("name")
    @classmethod
    def clean(cls, v):
        cleaned = " ".join(v.split())
        if len(cleaned) < 3:
            raise ValueError("El nombre de la comunidad debe tener al menos 3 caracteres.")
        return cleaned


class MeetingIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(default="", max_length=1000)
    place: str = Field(min_length=2, max_length=160)
    starts_at: datetime

    @field_validator("title", "place")
    @classmethod
    def clean_meeting_text(cls, v):
        cleaned = " ".join(v.split())
        if len(cleaned) < 2:
            raise ValueError("El texto no puede estar vacío.")
        return cleaned


class AttendanceIn(BaseModel):
    response: Literal["si", "no", "tal_vez"]


class NoticeIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    body: str = Field(min_length=3, max_length=1500)
    category: Literal["general", "clima", "reunion", "siembra"] = "general"

    @field_validator("title", "body")
    @classmethod
    def clean_notice_text(cls, v):
        cleaned = " ".join(v.split())
        if len(cleaned) < 3:
            raise ValueError("El texto debe tener al menos 3 caracteres.")
        return cleaned


class ObservationIn(BaseModel):
    kind: Literal["helada", "granizo", "lluvia_fuerte", "sequia", "otro"]
    description: str = Field(default="", max_length=600)
    observed_at: datetime | None = None


class ReviewIn(BaseModel):
    status: Literal["confirmada", "descartada"]


class RoleIn(BaseModel):
    role: Literal["member", "representative"]


class RecommendationIn(BaseModel):
    municipality_id: str
    crop: str
    variety: str | None = Field(default=None, max_length=80)
    soil_moisture: Literal["si", "poca", "no", "no_se"]
    irrigation: Literal["riego", "secano"]
    mode: Literal["real", "simulado"] = "real"


class ChatIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    session_id: str = Field(default="anon", max_length=64, pattern=r"^[A-Za-z0-9_-]+$")

    @field_validator("text")
    @classmethod
    def clean_chat_text(cls, v):
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Escriba un mensaje.")
        return cleaned
