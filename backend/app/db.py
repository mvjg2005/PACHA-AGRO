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


# Columnas agregadas después de la primera versión. `create_all` no altera tablas existentes,
# así que una base ya desplegada (p. ej. PostgreSQL en Render) las recibe aquí.
# (tabla, columna, tipo SQL compatible con SQLite y PostgreSQL)
ADDED_COLUMNS = [
    ("users", "crop_interests", "VARCHAR(200) DEFAULT ''"),
    ("outbound_messages", "wa_message_id", "VARCHAR(128)"),
    ("outbound_messages", "notice_id", "INTEGER"),
    ("outbound_messages", "error", "VARCHAR(300)"),
    ("outbound_messages", "updated_at", "TIMESTAMP"),
    ("users", "must_change_password", "BOOLEAN DEFAULT FALSE"),
    ("users", "token_version", "INTEGER DEFAULT 0"),
]


def ensure_columns(eng=None) -> list[str]:
    """Migración mínima e idempotente: agrega columnas faltantes. Devuelve las que agregó."""
    from sqlalchemy import inspect, text
    from sqlalchemy.exc import SQLAlchemyError

    eng = eng or engine
    added = []
    insp = inspect(eng)
    tables = set(insp.get_table_names())
    for table, column, ddl in ADDED_COLUMNS:
        if table not in tables or column in {c["name"] for c in insp.get_columns(table)}:
            continue
        try:
            with eng.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
            added.append(f"{table}.{column}")
        except SQLAlchemyError:
            pass  # otra instancia la agregó al mismo tiempo
    return added


def init_db() -> None:
    """Crea tablas y datos iniciales. Seguro de llamar varias veces y desde instancias en paralelo."""
    from sqlalchemy.exc import SQLAlchemyError

    from app.seed import seed

    try:
        Base.metadata.create_all(engine)
    except SQLAlchemyError:
        pass  # otra instancia la creó al mismo tiempo
    ensure_columns(engine)
    with SessionLocal() as db:
        try:
            seed(db)
        except SQLAlchemyError:
            db.rollback()  # otra instancia sembró los datos al mismo tiempo


engine = _make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
