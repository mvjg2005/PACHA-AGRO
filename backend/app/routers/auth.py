from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.ratelimit import client_key, login_limiter, register_limiter
from app.core.security import create_token, hash_password, verify_password
from app.data.catalog import crops_config, get_municipality
from app.db import get_db
from app.deps import current_user
from app.models import User
from app.schemas import DeleteAccountIn, LoginIn, PasswordChangeIn, ProfileUpdate, RegisterIn, UserOut
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
                whatsapp_opt_in=body.whatsapp_opt_in, whatsapp_opt_in_at=datetime.now() if body.whatsapp_opt_in else None,
                default_municipality_id=body.default_municipality_id)
    db.add(user)
    db.flush()
    log(db, "registro", "Nueva cuenta de agricultor", user.id)
    db.commit()
    return {"token": create_token(user.id), "user": UserOut.model_validate(user)}


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
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
    if body.crops is not None:
        valid = set(crops_config()["crops"])
        bad = [c for c in body.crops if c not in valid]
        if bad:
            raise HTTPException(422, f"Cultivo no válido: {', '.join(bad)}")
        user.crop_interests = ",".join(dict.fromkeys(body.crops))
    if body.whatsapp_opt_in is not None:
        user.whatsapp_opt_in = body.whatsapp_opt_in
        user.whatsapp_opt_in_at = datetime.now() if body.whatsapp_opt_in else None
        log(db, "whatsapp_consentimiento", "alta" if body.whatsapp_opt_in else "baja", user.id)
    db.commit()
    return user


@router.post("/password")
def change_password(body: PasswordChangeIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    login_limiter.check(f"{client_key(request)}:pw:{user.id}")
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(401, "La clave actual no es correcta.")
    if body.new_password == body.current_password:
        raise HTTPException(422, "La clave nueva debe ser distinta de la actual.")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    log(db, "clave_cambiada", "", user.id)
    db.commit()
    return {"ok": True, "user": UserOut.model_validate(user)}


@router.delete("/me")
def delete_account(body: DeleteAccountIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Elimina los datos personales de la cuenta (derecho de supresión).

    Se borran nombre, teléfono, clave, ubicación, cultivos, parcelas, cuaderno de campo, consentimiento, mensajes y membresías.
    Las publicaciones hechas en la comunidad quedan, pero firmadas como «Cuenta eliminada»."""
    import secrets

    from app.models import Attendance, Membership, OutboundMessage, Plot

    login_limiter.check(f"{client_key(request)}:del:{user.id}")
    if user.role == "admin":
        raise HTTPException(403, "La cuenta de administrador no se puede eliminar desde aquí.")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "La clave no es correcta.")
    for plot in db.query(Plot).filter(Plot.user_id == user.id).all():
        db.delete(plot)  # parcelas y cuaderno de campo: datos personales
    db.query(OutboundMessage).filter(OutboundMessage.user_id == user.id).delete()
    db.query(Attendance).filter(Attendance.user_id == user.id).delete()
    db.query(Membership).filter(Membership.user_id == user.id).delete()
    user.full_name = "Cuenta eliminada"
    user.phone = f"eliminado-{user.id}-{secrets.token_hex(3)}"[:20]
    user.password_hash = hash_password(secrets.token_urlsafe(32))
    user.is_active = False
    user.whatsapp_opt_in, user.whatsapp_opt_in_at = False, None
    user.default_municipality_id, user.crop_interests = None, ""
    log(db, "cuenta_eliminada", "", None)
    db.commit()
    return {"ok": True, "message": "Su cuenta y sus datos personales fueron eliminados."}
