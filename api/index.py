"""Punto de entrada de AgroBolivia en Vercel (función Python / ASGI).

Vercel sirve el frontend compilado (frontend/dist) desde su CDN y envía /api/* a esta función.
"""
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

# En Vercel solo /tmp es escribible. Sin DATABASE_URL se usa SQLite temporal (solo para pruebas:
# se borra y no se comparte entre instancias). Para la demo real configure DATABASE_URL (PostgreSQL).
os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/agrobolivia.db")
os.environ.setdefault("FRONTEND_DIST", "/nonexistent")  # el frontend lo sirve la CDN de Vercel

from app.core.config import validate_runtime_settings  # noqa: E402
from app import db as dbmod  # noqa: E402
from app.main import app  # noqa: E402,F401

# Vercel no siempre ejecuta lifespan: valida e inicializa al importar.
validate_runtime_settings()
dbmod.init_db()
