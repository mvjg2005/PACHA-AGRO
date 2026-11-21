from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.ratelimit import client_key, public_limiter
from app.data.catalog import crops_config, get_municipality
from app.db import get_db
from app.schemas import RecommendationIn
from app.services.recommendation.engine import Answers
from app.services.recommendation.run import recommend

router = APIRouter(prefix="/api", tags=["recomendaciones"])


@router.post("/recommendations")
def create_recommendation(body: RecommendationIn, request: Request, db: Session = Depends(get_db)):
    public_limiter.check(client_key(request))
    from app.routers.catalog import resolve_location

    m = resolve_location(body.municipality_id, body.lat, body.lon)
    crop = crops_config()["crops"].get(body.crop)
    if not crop:
        raise HTTPException(422, "Cultivo no disponible.")
    if body.variety and body.variety not in crop["varieties"]:
        raise HTTPException(422, "Variedad no reconocida.")
    return recommend(db, m, Answers(body.crop, body.variety, body.soil_moisture, body.irrigation), body.mode)
