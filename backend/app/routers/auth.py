
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.ratelimit import client_key, login_ip_limiter, login_limiter, register_limiter
from app.core.security import create_token, hash_password, verify_password
from app.data.catalog import get_municipality
from app.db import get_db
from app.deps import current_user
from app.models import User, utcnow
from app.schemas import LoginIn, ProfileUpdate, RegisterIn, UserOut
from app.services.activity import log

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    register_limiter.check(client_key(request))
    if db.scalar(select(User).where(User.phone == body.phone)):
        raise HTTPException(409, "Ya existe una cuenta con ese número.")
    if body.default_municipality_id and not get_municipality(body.default_municipality_id):
        raise HTTPException(422, "Municipio no válido.")
    user = User(full_name=body.full_name, phone=body.phone, password_hash=hash_password(body.password),
                whatsapp_opt_in=body.whatsapp_opt_in, whatsapp_opt_in_at=utcnow() if body.whatsapp_opt_in else None,
                default_municipality_id=body.default_municipality_id)
    db.add(user)
    db.flush()
    log(db, "registro", "Nueva cuenta de agricultor", user.id)
    db.commit()
    return {"token": create_token(user.id), "user": UserOut.model_validate(user)}


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    login_ip_limiter.check(client_key(request))
    login_limiter.check(f"{client_key(request)}:{body.phone}")
    user = db.scalar(select(User).where(User.phone == body.phone))
    if (not user or not user.is_active or (user.is_demo and not get_settings().seed_demo)
            or not verify_password(body.password, user.password_hash)):
        raise HTTPException(401, "Número o clave incorrectos.")
    return {"token": create_token(user.id), "user": UserOut.model_validate(user)}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.default_municipality_id is not None:
        if not get_municipality(body.default_municipality_id):
            raise HTTPException(422, "Municipio no válido.")
        user.default_municipality_id = body.default_municipality_id
    if body.whatsapp_opt_in is not None:
        user.whatsapp_opt_in = body.whatsapp_opt_in
        user.whatsapp_opt_in_at = utcnow() if body.whatsapp_opt_in else None
        log(db, "whatsapp_consentimiento", "alta" if body.whatsapp_opt_in else "baja", user.id)
    db.commit()
    return user
