from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import decode_token
from app.db import get_db
from app.models import Community, Membership, User


def optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    parsed = decode_token(auth[7:])
    if parsed is None:
        return None
    uid, version = parsed
    user = db.get(User, uid)
    if not user or user.token_version != version:
        return None
    return user if user.is_active and (get_settings().seed_demo or not user.is_demo) else None


_ALLOWED_WITH_TEMP_PASSWORD = {"/api/auth/me", "/api/auth/password"}


def current_user(request: Request, user: User | None = Depends(optional_user)) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail="Necesita ingresar con su cuenta.")
    # Con clave temporal (dada por un administrador) solo se puede ver el perfil y cambiar la clave.
    if user.must_change_password and request.url.path not in _ALLOWED_WITH_TEMP_PASSWORD:
        raise HTTPException(status_code=403, detail="Debe cambiar su clave temporal antes de continuar.")
    return user


def admin_user(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Solo un administrador puede hacer esto.")
    return user


def get_approved_community(db: Session, community_id: int) -> Community:
    c = db.get(Community, community_id)
    if c is None or c.status != "approved" or (c.is_demo and not get_settings().seed_demo):
        raise HTTPException(status_code=404, detail="Comunidad no encontrada.")
    return c


def membership_of(db: Session, user: User, community_id: int) -> Membership | None:
    return db.scalar(select(Membership).where(Membership.user_id == user.id, Membership.community_id == community_id))


def require_member(db: Session, user: User, community_id: int) -> Membership | None:
    """Miembro aprobado (o administrador)."""
    m = membership_of(db, user, community_id)
    if user.role == "admin":
        return m
    if m is None or m.status != "approved":
        raise HTTPException(status_code=403, detail="Debe ser miembro aprobado de esta comunidad.")
    return m


def require_representative(db: Session, user: User, community_id: int) -> None:
    if user.role == "admin":
        return
    m = membership_of(db, user, community_id)
    if m is None or m.status != "approved" or m.role != "representative":
        raise HTTPException(status_code=403, detail="Solo el representante de la comunidad puede hacer esto.")
