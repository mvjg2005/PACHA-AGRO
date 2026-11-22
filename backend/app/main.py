from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import check_production, get_settings
from app import db as dbmod
from app.routers import admin, advice, agent, auth, catalog, communities, education, field, livestock, notices, senas, recommendations, wall, whatsapp


@asynccontextmanager
async def lifespan(app: FastAPI):
    check_production()
    dbmod.init_db()
    yield


app = FastAPI(title="AgroBolivia API", version="0.1.0", lifespan=lifespan,
              description="Prototipo de asistencia agroclimática y comunicación comunitaria.")
s = get_settings()
app.add_middleware(GZipMiddleware, minimum_size=800)
app.add_middleware(CORSMiddleware, allow_origins=s.cors_list, allow_methods=["*"], allow_headers=["Authorization", "Content-Type"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    resp.headers["Permissions-Policy"] = "geolocation=(self), camera=(), microphone=(self)"
    if s.environment == "production":
        resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return resp


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    msgs = []
    for e in exc.errors():
        msg = str(e.get("msg", "Dato no válido")).removeprefix("Value error, ")
        field = e.get("loc", ["", ""])[-1]
        msgs.append({"field": field, "message": msg})
    return JSONResponse(status_code=422, content={"detail": "Revise los datos ingresados.", "errors": msgs})


for r in (auth.router, catalog.router, recommendations.router, communities.router, admin.router, education.router,
          notices.router, advice.router, field.router, senas.router, agent.router, livestock.router, whatsapp.router, wall.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    """Estado para Render/monitoreo: responde 503 si la base de datos no está disponible."""
    from sqlalchemy import text

    from app.services.whatsapp.channels import get_channel

    try:
        with dbmod.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:  # noqa: BLE001
        db_ok = False
    body = {"status": "ok" if db_ok else "degradado", "database": db_ok, "environment": s.environment,
            "whatsapp": get_channel().name,
            "weather": {"official_source": bool(s.official_weather_url), "open_meteo_paid_key": bool(s.open_meteo_api_key)}}
    return body if db_ok else JSONResponse(status_code=503, content=body)


# Sirve el frontend compilado (opcional): un solo proceso para la demostración.
dist = (Path(__file__).resolve().parent.parent / s.frontend_dist).resolve()
if dist.exists():
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = (dist / path).resolve()
        if path and f.is_file() and dist in f.parents:
            return FileResponse(f)
        return FileResponse(dist / "index.html")
