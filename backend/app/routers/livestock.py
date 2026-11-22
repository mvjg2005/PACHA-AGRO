"""Uywa · Ganado en riesgo."""
import json
from functools import lru_cache
from pathlib import Path
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


@lru_cache
def _businesses() -> dict:
    return json.loads((Path(__file__).resolve().parent.parent / "data" / "businesses.json").read_text(encoding="utf-8"))


@router.get("/negocios")
def businesses(municipality_id: str | None = Query(None, max_length=60), service: str | None = Query(None, max_length=20),
               limit: int = Query(9, ge=1, le=60)):
    """Negocios agropecuarios y veterinarios de un directorio público, del departamento del municipio elegido.
    Primero los del mismo municipio. Se muestran con su fuente y el aviso de que no están verificados."""
    d = _businesses()
    m = get_municipality(municipality_id) if municipality_id else None
    if not m:
        return {"note": d["note"], "source": d["source"], "services": d["services"], "items": [], "total": 0}
    items = [i for i in d["items"] if i.get("department_id") == m["department_id"]]
    counts = {k: sum(1 for i in items if k in i["services"]) for k in d["services"]}
    if service:
        items = [i for i in items if service in i["services"]]
    order = {i["id"]: k for k, i in enumerate(d["items"])}  # el archivo ya viene ordenado por relevancia
    items.sort(key=lambda i: (i.get("municipality_id") != m["id"], order[i["id"]]))
    out = []
    for i in items[:limit]:
        bm = get_municipality(i["municipality_id"]) if i.get("municipality_id") else None
        digits = i["phone"].lstrip("+")
        out.append({**i, "municipality": f"{bm['name']}, {bm['department_name']}" if bm else i.get("municipality_name", ""),
                    "same_municipality": i.get("municipality_id") == m["id"],
                    "whatsapp_url": f"https://wa.me/{digits}" if i.get("mobile") else None,
                    "service_labels": [d["services"][x] for x in i["services"]]})
    return {"note": d["note"], "source": d["source"], "services": d["services"], "counts": counts,
            "items": out, "total": len(items)}
