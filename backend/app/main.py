from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app import db as dbmod
from app.routers import admin, auth, catalog, communities, education, notices, recommendations, whatsapp


@asynccontextmanager
async def lifespan(app: FastAPI):
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
          notices.router, whatsapp.router):
    app.include_router(r)


@app.get("/api/health")
def health(db: Session = Depends(dbmod.get_db)):
    """Readiness check: verifica que la base responda antes de marcar la instancia saludable."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Base de datos no disponible.") from exc
    return {"status": "ok", "database": "ok"}


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
