"""Mi campo: diagnóstico por foto, fichas de cultivo y parcelas con cuaderno de campo."""
import json
from datetime import date
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.ratelimit import RateLimiter, client_key
from app.data.catalog import crops_config, get_municipality
from app.db import get_db
from app.deps import current_user
from app.models import FieldRecord, Plot, User
from app.schemas import DiagnosisIn, PlotIn, RecordIn
from app.services import diagnosis

router = APIRouter(prefix="/api", tags=["mi campo"])
diagnosis_limiter = RateLimiter(max_calls=8, per_seconds=600)

MAX_PLOTS = 50
MAX_RECORDS = 1000
TO_KG = {"kg": 1.0, "qq": 46.0, "arroba": 11.5, "t": 1000.0}  # quintal y arroba bolivianos
KIND_LABEL = {"siembra": "Siembra", "riego": "Riego", "fertilizacion": "Abonado o fertilización", "control": "Control de plagas o enfermedades",
              "deshierbe": "Deshierbe", "aporque": "Aporque", "cosecha": "Cosecha", "venta": "Venta", "gasto": "Otro gasto",
              "observacion": "Observación"}


@lru_cache
def sheets() -> dict:
    return json.loads((Path(__file__).resolve().parent.parent / "data" / "crop_sheets.json").read_text(encoding="utf-8"))


@router.get("/crops/sheets")
def list_sheets():
    d = sheets()
    return {"note": d["note"], "source_link": d["source_link"],
            "sheets": [{k: s[k] for k in ("id", "name", "scientific", "summary", "regions")} for s in d["sheets"]]}


@router.get("/crops/sheets/{crop_id}")
def get_sheet(crop_id: str):
    d = sheets()
    s = next((x for x in d["sheets"] if x["id"] == crop_id), None)
    if not s:
        raise HTTPException(404, "No hay ficha para ese cultivo.")
    return {**s, "note": d["note"], "source_link": d["source_link"]}


@router.get("/diagnosis/guide")
def symptom_guide():
    return {"guide": diagnosis.SYMPTOM_GUIDE}


@router.post("/diagnosis")
def diagnose(body: DiagnosisIn, request: Request, db: Session = Depends(get_db)):
    diagnosis_limiter.check(client_key(request))
    try:
        return diagnosis.diagnose(db, body.image, body.media_type, body.crop, body.municipality_id, body.notes)
    except diagnosis.ImageError as e:
        raise HTTPException(422, str(e)) from e


# --- Parcelas y cuaderno de campo -------------------------------------------------------------

def _validate_plot(body: PlotIn) -> None:
    if body.crop and body.crop not in crops_config()["crops"]:
        raise HTTPException(422, "Cultivo no válido.")
    if body.municipality_id and not get_municipality(body.municipality_id):
        raise HTTPException(422, "Municipio no válido.")


def _summary(p: Plot) -> dict:
    costs = sum(r.cost_bs or 0 for r in p.records if r.kind != "venta")
    income = sum(r.cost_bs or 0 for r in p.records if r.kind == "venta")
    harvest = sum((r.quantity or 0) * TO_KG[r.unit] for r in p.records if r.kind == "cosecha" and r.unit in TO_KG)
    days = None
    if p.sowing_date:
        days = (date.today() - date.fromisoformat(p.sowing_date)).days
    return {"costs_bs": round(costs, 2), "income_bs": round(income, 2), "balance_bs": round(income - costs, 2),
            "harvest_kg": round(harvest, 1), "yield_kg_ha": round(harvest / p.area_ha, 1) if harvest and p.area_ha else None,
            "days_since_sowing": days, "records": len(p.records)}


def _plot_out(p: Plot, with_records: bool = False) -> dict:
    m = get_municipality(p.municipality_id) if p.municipality_id else None
    crops = crops_config()["crops"]
    out = {"id": p.id, "name": p.name, "crop": p.crop, "crop_name": crops[p.crop]["name"] if p.crop in crops else "",
           "variety": p.variety, "area_ha": p.area_ha, "area_method": p.area_method, "municipality_id": p.municipality_id,
           "municipality_name": f"{m['name']}, {m['department_name']}" if m else None, "sowing_date": p.sowing_date,
           "notes": p.notes, "summary": _summary(p)}
    if with_records:
        out["records"] = [{"id": r.id, "date": r.date, "kind": r.kind, "kind_label": KIND_LABEL[r.kind], "description": r.description,
                           "quantity": r.quantity, "unit": r.unit, "cost_bs": r.cost_bs} for r in p.records]
    return out


def _own_plot(db: Session, user: User, plot_id: int) -> Plot:
    p = db.get(Plot, plot_id)
    if not p or p.user_id != user.id or p.archived:
        raise HTTPException(404, "Parcela no encontrada.")
    return p


@router.get("/plots")
def list_plots(user: User = Depends(current_user), db: Session = Depends(get_db)):
    plots = db.scalars(select(Plot).where(Plot.user_id == user.id, Plot.archived.is_(False)).order_by(Plot.created_at.desc())).all()
    return {"plots": [_plot_out(p) for p in plots], "record_kinds": KIND_LABEL}


@router.post("/plots", status_code=201)
def create_plot(body: PlotIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _validate_plot(body)
    n = db.scalar(select(func.count()).select_from(Plot).where(Plot.user_id == user.id, Plot.archived.is_(False)))
    if n >= MAX_PLOTS:
        raise HTTPException(422, f"Puede registrar hasta {MAX_PLOTS} parcelas.")
    p = Plot(user_id=user.id, **body.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return _plot_out(p, with_records=True)


@router.get("/plots/{plot_id}")
def get_plot(plot_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {**_plot_out(_own_plot(db, user, plot_id), with_records=True), "record_kinds": KIND_LABEL}


@router.put("/plots/{plot_id}")
def update_plot(plot_id: int, body: PlotIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _own_plot(db, user, plot_id)
    _validate_plot(body)
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    db.commit()
    return _plot_out(p, with_records=True)


@router.delete("/plots/{plot_id}")
def delete_plot(plot_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(_own_plot(db, user, plot_id))
    db.commit()
    return {"ok": True}


@router.post("/plots/{plot_id}/records", status_code=201)
def add_record(plot_id: int, body: RecordIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _own_plot(db, user, plot_id)
    if len(p.records) >= MAX_RECORDS:
        raise HTTPException(422, "Esta parcela llegó al máximo de registros.")
    if body.kind == "cosecha" and body.quantity and body.unit not in TO_KG:
        raise HTTPException(422, "Para la cosecha use kg, quintales, arrobas o toneladas.")
    db.add(FieldRecord(plot_id=p.id, **body.model_dump()))
    if body.kind == "siembra" and not p.sowing_date:
        p.sowing_date = body.date
    db.commit()
    db.refresh(p)
    return _plot_out(p, with_records=True)


@router.delete("/plots/{plot_id}/records/{record_id}")
def delete_record(plot_id: int, record_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _own_plot(db, user, plot_id)
    r = db.get(FieldRecord, record_id)
    if not r or r.plot_id != p.id:
        raise HTTPException(404, "Registro no encontrado.")
    db.delete(r)
    db.commit()
    db.refresh(p)
    return _plot_out(p, with_records=True)
