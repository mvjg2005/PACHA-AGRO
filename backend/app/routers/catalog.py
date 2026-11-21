from fastapi import APIRouter, HTTPException, Query, Request

from app.core.ratelimit import client_key, public_limiter
from app.data.catalog import NEAR_KM, crops_config, get_municipality, in_bolivia, locations, nearest_municipality, point_location
from app.services.weather.service import get_weather

router = APIRouter(prefix="/api", tags=["catalog"])


@router.get("/locations")
def list_locations():
    return locations()


@router.get("/crops")
def list_crops():
    cfg = crops_config()
    return {
        "disclaimer": cfg["disclaimer"], "status_labels": cfg["status_labels"],
        "crops": [{"id": k, "name": v["name"], "varieties": v["varieties"], "regions": v.get("regions", {})}
                  for k, v in cfg["crops"].items()],
        "config": {"weights": cfg["weights"], "critical_criteria": cfg["critical_criteria"], "aggregation": cfg["aggregation"]},
        "calendars": [{"crop": c["crop"], "department_id": c["department_id"]} for c in cfg["calendars"]],
    }


def resolve_location(municipality_id: str | None, lat: float | None, lon: float | None) -> dict:
    """Coordenadas GPS (si vienen) o municipio de la lista. Las coordenadas no se guardan."""
    if lat is not None and lon is not None:
        if not in_bolivia(lat, lon):
            raise HTTPException(422, "Esa ubicación está fuera de Bolivia.")
        return point_location(lat, lon)
    m = get_municipality(municipality_id or "")
    if not m:
        raise HTTPException(404, "Municipio no encontrado.")
    return m


@router.get("/locate")
def locate(request: Request, lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180)):
    public_limiter.check(client_key(request))
    """Municipio registrado más cercano a unas coordenadas (para «Usar mi ubicación»)."""
    if not in_bolivia(lat, lon):
        raise HTTPException(422, "Esa ubicación está fuera de Bolivia.")
    m, dist = nearest_municipality(lat, lon)
    return {"municipality_id": m["id"], "municipality_name": m["name"], "department_name": m["department_name"],
            "distance_km": dist, "far": dist > NEAR_KM,
            "note": None if dist <= NEAR_KM else f"El municipio registrado más cercano está a {dist:.0f} km: "
                                                 "el clima será de su punto exacto, pero el calendario de siembra puede no aplicar."}


@router.get("/weather")
def weather(request: Request, municipality_id: str | None = Query(None, max_length=60), mode: str = Query("real", pattern="^(real|simulado)$"),
            lat: float | None = Query(None, ge=-90, le=90), lon: float | None = Query(None, ge=-180, le=180)):
    public_limiter.check(client_key(request))
    w = get_weather(resolve_location(municipality_id, lat, lon), mode)
    return w
