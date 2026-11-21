"""Señas andinas medidas con datos y Pachagrama (calendario vivo de la campaña)."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.ratelimit import RateLimiter
from app.data.catalog import department_ids, get_municipality
from app.db import get_db
from app.deps import current_user, optional_user
from app.models import SenaObservation, User
from app.schemas import SenaIn
from app.services import senas
from app.services.activity import log

router = APIRouter(prefix="/api", tags=["señas y pachagrama"])
sena_limiter = RateLimiter(max_calls=30, per_seconds=3600)
MIN_CAMPAIGN = 2001  # NASA POWER tiene datos diarios desde 1981; la climatología usa 2001 en adelante


def _campaign(c: int | None) -> int:
    cur = senas.campaign_of(date.today())
    c = cur if c is None else c
    if c < MIN_CAMPAIGN or c > cur:
        raise HTTPException(422, f"Elija una campaña entre {MIN_CAMPAIGN} y {cur}.")
    return c


def _muni(mid: str) -> dict:
    m = get_municipality(mid)
    if not m:
        raise HTTPException(422, "Municipio no válido.")
    return m


@router.get("/senas")
def catalog():
    cur = senas.campaign_of(date.today())
    return {**senas.catalog(), "current_campaign": cur, "current_campaign_label": senas.campaign_label(cur)}


@router.get("/senas/zona")
def zone(municipality_id: str = Query(max_length=60), campaign: int | None = None,
         user: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    m = _muni(municipality_id)
    c = _campaign(campaign)
    mine = []
    if user:
        mine = [senas.obs_out(o, mine=True) for o in db.scalars(select(SenaObservation).where(
            SenaObservation.user_id == user.id, SenaObservation.campaign == c).order_by(SenaObservation.observed_on.desc()))]
    return {"campaign": c, "campaign_label": senas.campaign_label(c), "municipality": {"id": m["id"], "name": m["name"], "department_name": m["department_name"]},
            **senas.consensus(db, municipality_id, c), "outcome": senas.outcome(m, c), "mine": mine}


@router.post("/senas/observaciones", status_code=201)
def add(body: SenaIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    sena_limiter.check(f"u{user.id}")
    m = _muni(body.municipality_id)
    if not senas.reading(body.sena_id, body.reading):
        raise HTTPException(422, "Seña o lectura no válida.")
    if body.sena_id == "otra" and len(body.custom_name) < 3:
        raise HTTPException(422, "Escriba el nombre de la seña.")
    d = date.fromisoformat(body.observed_on)
    if d > date.today():
        raise HTTPException(422, "La fecha no puede ser futura.")
    c = senas.campaign_of(d)
    if c < MIN_CAMPAIGN:
        raise HTTPException(422, f"Registre señas desde la campaña {MIN_CAMPAIGN}.")
    n = db.scalar(select(func.count()).select_from(SenaObservation).where(
        SenaObservation.user_id == user.id, SenaObservation.campaign == c, SenaObservation.sena_id == body.sena_id,
        SenaObservation.custom_name == body.custom_name, SenaObservation.municipality_id == m["id"]))
    if n:
        raise HTTPException(409, "Ya registró esta seña para esta campaña en este municipio. Puede borrarla y registrarla de nuevo.")
    o = SenaObservation(user_id=user.id, sena_id=body.sena_id, reading=body.reading, municipality_id=m["id"],
                        department_id=m["department_id"], campaign=c, observed_on=body.observed_on,
                        custom_name=body.custom_name if body.sena_id == "otra" else "", notes=body.notes, is_demo=user.is_demo)
    db.add(o)
    db.commit()
    log(db, "sena_registrada", f"{o.sena_id}:{o.reading} {o.municipality_id} {c}", user_id=user.id)
    db.commit()
    return senas.obs_out(o, mine=True)


@router.delete("/senas/observaciones/{oid}")
def remove(oid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    o = db.get(SenaObservation, oid)
    if not o or o.user_id != user.id:
        raise HTTPException(404, "Registro no encontrado.")
    db.delete(o)
    db.commit()
    return {"ok": True}


@router.get("/senas/confiabilidad")
def reliability(department_id: str | None = Query(None, max_length=40), db: Session = Depends(get_db)):
    if department_id and department_id not in department_ids():
        raise HTTPException(422, "Departamento no válido.")
    return senas.reliability(db, department_id)


@router.get("/pachagrama")
def pachagrama(municipality_id: str = Query(max_length=60), campaign: int | None = None, db: Session = Depends(get_db)):
    _muni(municipality_id)
    return senas.pachagrama(db, municipality_id, _campaign(campaign))
