from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ratelimit import chat_limiter, client_key
from app.data.catalog import crops_config, department_ids
from app.db import get_db
from app.deps import admin_user
from app.models import Expert, User
from app.schemas import AssistantIn, ExpertIn
from app.services import advisor
from app.services.agent import provider_keys
from app.services.activity import log

router = APIRouter(prefix="/api", tags=["asesoría"])


@router.get("/resources")
def list_resources():
    return advisor.resources()


@router.get("/experts")
def list_experts(department_id: str | None = Query(None, max_length=40), crop: str | None = Query(None, max_length=30), db: Session = Depends(get_db)):
    return [advisor.expert_out(e) for e in advisor.find_experts(db, department_id, crop, set(), limit=50)]


@router.post("/assistant")
def ask(body: AssistantIn, request: Request, db: Session = Depends(get_db)):
    chat_limiter.check(client_key(request))
    out = advisor.advise(db, body.question, body.municipality_id, body.crop)
    out["ai_available"] = bool(provider_keys()["groq"])
    return out


def _validate(body: ExpertIn) -> None:
    if not body.consent:
        raise HTTPException(422, "Solo se puede publicar a un técnico que aceptó mostrar su contacto.")
    if not (body.phone or body.email):
        raise HTTPException(422, "Registre al menos un teléfono o un correo.")
    bad = [c for c in body.crops if c not in crops_config()["crops"]] + [d for d in body.departments if d not in department_ids()]
    if bad:
        raise HTTPException(422, f"Valor no válido: {', '.join(bad)}")


@router.get("/admin/experts")
def admin_list(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    return [{**advisor.expert_out(e), "active": e.active, "consent": e.consent} for e in db.scalars(select(Expert).order_by(Expert.full_name))]


@router.post("/admin/experts", status_code=201)
def admin_create(body: ExpertIn, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    _validate(body)
    e = Expert(full_name=body.full_name, specialty=body.specialty, institution=body.institution, phone=body.phone, email=body.email,
               crops=",".join(body.crops), departments=",".join(body.departments), consent=True, verified=body.verified, created_by=admin.id)
    db.add(e)
    db.flush()
    log(db, "tecnico_registrado", e.full_name, admin.id)
    db.commit()
    return advisor.expert_out(e)


@router.post("/admin/experts/{eid}/deactivate")
def admin_deactivate(eid: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    e = db.get(Expert, eid)
    if e is None:
        raise HTTPException(404, "Técnico no encontrado.")
    e.active = False
    log(db, "tecnico_retirado", e.full_name, admin.id)
    db.commit()
    return {"id": e.id, "active": False}
