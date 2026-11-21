from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def normalize_db_url(url: str) -> str:
    """Neon/Vercel/Render entregan 'postgres://' o 'postgresql://'; SQLAlchemy necesita el driver psycopg 3."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def _make_engine(url: str):
    url = normalize_db_url(url)
    kwargs = {}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    else:
        # Funciones serverless: conexiones cortas y verificadas antes de usarse.
        kwargs.update(pool_pre_ping=True, pool_size=2, max_overflow=2, pool_recycle=300)
    return create_engine(url, **kwargs)


def init_db() -> None:
    """Crea tablas y datos iniciales; los errores reales abortan el arranque."""
    from app.seed import seed

    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)


engine = _make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
