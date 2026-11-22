"""Uywa · Ganado en riesgo."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ratelimit import RateLimiter
from app.core.time import local_today
from app.data.catalog import department_ids, get_municipality
from app.db import get_db
from app.deps import current_user
from app.models import LivestockLoss, User
from app.schemas import LivestockLossIn
from app.services import bulletin, livestock, senas

router = APIRouter(prefix="/api/ganado", tags=["ganado"])
loss_limiter = RateLimiter(max_calls=30, per_seconds=3600)


def _muni(mid: str) -> dict:
    m = get_municipality(mid)
    if not m:
        raise HTTPException(422, "Municipio no válido.")
    return m


def _campaign(c: int | None) -> int:
    cur = senas.campaign_of(local_today())
    c = cur if c is None else c
    if c < 2001 or c > cur:
        raise HTTPException(422, f"Elija una campaña entre 2001 y {cur}.")
    return c


@router.get("/catalogo")
def catalog():
    return {"species": livestock.SPECIES, "causes": livestock.CAUSES, "no_roof": livestock.NO_ROOF,
            "current_campaign": senas.campaign_of(local_today())}


@router.get("/noches")
def nights(municipality_id: str = Query(max_length=60)):
    return livestock.nights(_muni(municipality_id))


@router.get("/sequia")
def drought(municipality_id: str = Query(max_length=60), db: Session = Depends(get_db)):
    return livestock.drought(db, _muni(municipality_id))


@router.get("/perdidas/resumen")
def summary(municipality_id: str | None = Query(None, max_length=60), department_id: str | None = Query(None, max_length=40),
            campaign: int | None = None, db: Session = Depends(get_db)):
    if municipality_id:
        _muni(municipality_id)
    if department_id and department_id not in department_ids():
        raise HTTPException(422, "Departamento no válido.")
    return livestock.summary(db, municipality_id, department_id, _campaign(campaign))


@router.get("/perdidas/mias")
def mine(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(LivestockLoss).where(LivestockLoss.user_id == user.id).order_by(LivestockLoss.date.desc()).limit(50))
    return [livestock.loss_out(r) for r in rows]


@router.post("/perdidas", status_code=201)
def add_loss(body: LivestockLossIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    loss_limiter.check(f"u{user.id}")
    m = _muni(body.municipality_id)
    d = date.fromisoformat(body.date)
    if d > local_today():
        raise HTTPException(422, "La fecha no puede ser futura.")
    if d.year < 2015:
        raise HTTPException(422, "Registre pérdidas desde 2015.")
    x = LivestockLoss(user_id=user.id, municipality_id=m["id"], department_id=m["department_id"], community_name=body.community_name,
                      campaign=senas.campaign_of(d), date=body.date, species=body.species, count=body.count, cause=body.cause,
                      notes=body.notes, is_demo=user.is_demo)
    db.add(x)
    db.commit()
    return livestock.loss_out(x)


@router.delete("/perdidas/{loss_id}")
def delete_loss(loss_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    x = db.get(LivestockLoss, loss_id)
    if not x or x.user_id != user.id:
        raise HTTPException(404, "Registro no encontrado.")
    db.delete(x)
    db.commit()
    return {"ok": True}


@router.get("/informe")
def report(municipality_id: str = Query(max_length=60), campaign: int | None = None, db: Session = Depends(get_db)):
    return livestock.report(db, _muni(municipality_id), _campaign(campaign))


@router.get("/boletin")
def weekly_bulletin(municipality_id: str = Query(max_length=60)):
    """SMS corto y texto para radio con el pronóstico de la semana (para quien no tiene internet)."""
    return bulletin.build(_muni(municipality_id))
