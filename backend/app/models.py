"""Modelo de datos. Compatible con SQLite (desarrollo) y PostgreSQL (producción)."""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    # Rol global: "farmer", "editor" (publica avisos regionales) o "admin".
    # El rol de representante es POR comunidad (Membership.role).
    role: Mapped[str] = mapped_column(String(20), default="farmer")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    whatsapp_opt_in: Mapped[bool] = mapped_column(Boolean, default=False)
    whatsapp_opt_in_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    default_municipality_id: Mapped[str | None] = mapped_column(String(60), nullable=True)
    # Cultivos de interés separados por coma (ej. "quinua,papa"); segmentan los avisos regionales.
    crop_interests: Mapped[str] = mapped_column(String(200), default="")
    # Clave temporal dada por un administrador: debe cambiarse al ingresar.
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    @property
    def crops(self) -> list[str]:
        return [c for c in (self.crop_interests or "").split(",") if c]

    memberships: Mapped[list["Membership"]] = relationship(back_populates="user", foreign_keys="Membership.user_id")


class Community(Base):
    __tablename__ = "communities"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    department_id: Mapped[str] = mapped_column(String(40), index=True)
    municipality_id: Mapped[str] = mapped_column(String(60), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    # pending -> approved | rejected (lo aprueba un administrador)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    memberships: Mapped[list["Membership"]] = relationship(back_populates="community")
    __table_args__ = (UniqueConstraint("municipality_id", "name", name="uq_community_name"),)


class Membership(Base):
    __tablename__ = "memberships"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("communities.id"), index=True)
    role: Mapped[str] = mapped_column(String(20), default="member")  # member | representative
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | approved | rejected
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    user: Mapped[User] = relationship(back_populates="memberships", foreign_keys=[user_id])
    community: Mapped[Community] = relationship(back_populates="memberships")
    __table_args__ = (UniqueConstraint("user_id", "community_id", name="uq_membership"),)


class Meeting(Base):
    __tablename__ = "meetings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("communities.id"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    place: Mapped[str] = mapped_column(String(160))
    starts_at: Mapped[datetime] = mapped_column(DateTime)  # hora local de Bolivia (UTC-4), sin zona
    cancelled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Attendance(Base):
    __tablename__ = "attendance"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    response: Mapped[str] = mapped_column(String(10))  # si | no | tal_vez
    channel: Mapped[str] = mapped_column(String(20), default="web")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    __table_args__ = (UniqueConstraint("meeting_id", "user_id", name="uq_attendance"),)


class Notice(Base):
    __tablename__ = "notices"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("communities.id"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(20), default="general")
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Observation(Base):
    """Observación comunitaria. NUNCA es una alerta oficial."""
    __tablename__ = "observations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("communities.id"), index=True)
    municipality_id: Mapped[str] = mapped_column(String(60), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(20))  # helada | granizo | lluvia_fuerte | sequia | otro
    description: Mapped[str] = mapped_column(Text, default="")
    observed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    channel: Mapped[str] = mapped_column(String(20), default="web")
    review_status: Mapped[str] = mapped_column(String(30), default="sin_revisar")  # sin_revisar | confirmada | descartada
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ActivityLog(Base):
    __tablename__ = "activity_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    community_id: Mapped[int | None] = mapped_column(ForeignKey("communities.id"), nullable=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(40))
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class OutboundMessage(Base):
    """Mensajes salientes (recordatorios/avisos). En modo simulador NO se envían: quedan como 'simulado'."""
    __tablename__ = "outbound_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    template: Mapped[str] = mapped_column(String(60))
    body: Mapped[str] = mapped_column(Text)
    meeting_id: Mapped[int | None] = mapped_column(ForeignKey("meetings.id"), nullable=True)
    channel: Mapped[str] = mapped_column(String(20), default="simulador")
    # simulado | enviado | entregado | leido | fallido  (los tres últimos llegan por el webhook de Meta)
    status: Mapped[str] = mapped_column(String(20), default="simulado")
    wa_message_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    notice_id: Mapped[int | None] = mapped_column(ForeignKey("regional_notices.id"), nullable=True)
    error: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class InboundMessage(Base):
    """IDs de mensajes entrantes de Meta para ignorar reintentos del webhook."""
    __tablename__ = "inbound_messages"
    wa_message_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class RegionalNotice(Base):
    """Aviso regional segmentado por alcance (adaptado del proyecto PACHAAGRO).

    Lo publica un administrador o editor de contenido. NUNCA es un aviso oficial del SENAMHI:
    la interfaz y la API lo etiquetan como 'aviso de la plataforma'."""
    __tablename__ = "regional_notices"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(140))
    summary: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text, default="")
    kind: Mapped[str] = mapped_column(String(20), default="aviso")  # aviso | comunicado | clima | evento
    scope: Mapped[str] = mapped_column(String(20), default="nacional")  # nacional | departamento | municipio | cultivo
    department_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    municipality_id: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    crop_id: Mapped[str | None] = mapped_column(String(30), nullable=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class WeatherCache(Base):
    """Caché persistente de datos meteorológicos.

    Sobrevive a reinicios y despliegues, se comparte entre procesos y permite mostrar el último
    pronóstico obtenido (con su hora) cuando el proveedor falla o limita las consultas."""
    __tablename__ = "weather_cache"
    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    payload: Mapped[str] = mapped_column(Text)
    fetched_at: Mapped[datetime] = mapped_column(DateTime)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class ChatState(Base):
    """Estado de conversación del asistente de WhatsApp (antes en memoria; se perdía al reiniciar)."""
    __tablename__ = "chat_state"
    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    data: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
