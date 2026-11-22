"""Muro del campo: publicaciones abiertas, como una red social sencilla.

* Cualquiera puede leer; para publicar, responder, marcar «Me sirve» o reportar se necesita cuenta.
* Se muestra el nombre corto del autor y su municipio; nunca el celular.
* Tres reportes de personas distintas ocultan una publicación; el autor o un administrador pueden borrarla.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.ratelimit import RateLimiter
from app.data.catalog import get_municipality
from app.db import get_db
from app.deps import current_user, optional_user
from app.models import Post, PostReaction, User

router = APIRouter(prefix="/api/muro", tags=["muro"])
post_limiter = RateLimiter(max_calls=20, per_seconds=3600)
HIDE_AT = 3
KINDS = {"general": "Comentario", "pregunta": "Pregunta", "clima": "Clima", "ganado": "Ganado", "siembra": "Siembra", "venta": "Compra y venta"}


class PostIn(BaseModel):
    text: str = Field(min_length=3, max_length=800)
    kind: str = "general"
    municipality_id: str = Field(max_length=60)
    parent_id: int | None = None

    @field_validator("kind")
    @classmethod
    def valid_kind(cls, v: str) -> str:
        if v not in KINDS:
            raise ValueError("Tipo de publicación no válido.")
        return v

    @field_validator("text")
    @classmethod
    def clean(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Escriba al menos 3 letras.")
        return v


def short_name(full: str) -> str:
    parts = full.split()
    return parts[0] if len(parts) < 2 else f"{parts[0]} {parts[1][0]}."


def _visible():
    return Post.hidden.is_(False)


def post_out(db: Session, p: Post, user: User | None) -> dict:
    author = db.get(User, p.user_id)
    m = get_municipality(p.municipality_id) or {}
    counts = dict(db.execute(select(PostReaction.kind, func.count()).where(PostReaction.post_id == p.id).group_by(PostReaction.kind)).all())
    mine = set(db.scalars(select(PostReaction.kind).where(PostReaction.post_id == p.id, PostReaction.user_id == user.id))) if user else set()
    replies = db.scalar(select(func.count(Post.id)).where(Post.parent_id == p.id, _visible())) if p.parent_id is None else 0
    return {"id": p.id, "parent_id": p.parent_id, "text": p.text, "kind": p.kind, "kind_label": KINDS.get(p.kind, "Comentario"),
            "author": short_name(author.full_name) if author else "Persona", "author_role": author.role if author else None,
            "municipality_id": p.municipality_id, "municipality_name": m.get("name"), "department_name": m.get("department_name"),
            "created_at": p.created_at.isoformat(timespec="minutes") + "Z", "useful": counts.get("util", 0), "replies": replies,
            "useful_by_me": "util" in mine, "reported_by_me": "reporte" in mine,
            "can_delete": bool(user and (user.id == p.user_id or user.role == "admin"))}


@router.get("")
def feed(department_id: str | None = Query(None, max_length=40), municipality_id: str | None = Query(None, max_length=60),
         before_id: int | None = None, limit: int = Query(20, ge=1, le=50),
         user: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    q = select(Post).where(Post.parent_id.is_(None), _visible())
    if municipality_id:
        q = q.where(Post.municipality_id == municipality_id)
    elif department_id:
        q = q.where(Post.department_id == department_id)
    if before_id:
        q = q.where(Post.id < before_id)
    rows = db.scalars(q.order_by(Post.id.desc()).limit(limit + 1)).all()
    return {"items": [post_out(db, p, user) for p in rows[:limit]], "has_more": len(rows) > limit}


@router.get("/{pid}/respuestas")
def replies(pid: int, user: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    p = db.get(Post, pid)
    if p is None or p.hidden or p.parent_id is not None:
        raise HTTPException(404, "Publicación no encontrada.")
    rows = db.scalars(select(Post).where(Post.parent_id == pid, _visible()).order_by(Post.id)).all()
    return [post_out(db, r, user) for r in rows]


@router.post("", status_code=201)
def create(body: PostIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.is_demo and not get_settings().seed_demo:
        raise HTTPException(403, "Las cuentas de demostración no pueden publicar.")
    post_limiter.check(f"u{user.id}")
    m = get_municipality(body.municipality_id)
    if not m:
        raise HTTPException(422, "Municipio no válido.")
    kind = body.kind
    if body.parent_id is not None:
        parent = db.get(Post, body.parent_id)
        if parent is None or parent.hidden or parent.parent_id is not None:
            raise HTTPException(404, "Publicación no encontrada.")
        kind = "general"
    p = Post(user_id=user.id, parent_id=body.parent_id, municipality_id=m["id"], department_id=m["department_id"], kind=kind, text=body.text)
    db.add(p)
    db.commit()
    return post_out(db, p, user)


def _toggle(db: Session, pid: int, user: User, kind: str) -> Post:
    p = db.get(Post, pid)
    if p is None or p.hidden:
        raise HTTPException(404, "Publicación no encontrada.")
    existing = db.scalar(select(PostReaction).where(PostReaction.post_id == pid, PostReaction.user_id == user.id, PostReaction.kind == kind))
    if existing and kind == "util":
        db.delete(existing)
    elif not existing:
        db.add(PostReaction(post_id=pid, user_id=user.id, kind=kind))
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
    return p


@router.post("/{pid}/me-sirve")
def useful(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _toggle(db, pid, user, "util")
    db.commit()
    return post_out(db, p, user)


@router.post("/{pid}/reportar")
def report(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    own = db.get(Post, pid)
    if own is not None and own.user_id == user.id:
        raise HTTPException(422, "No puede reportar su propia publicación; puede borrarla.")
    p = _toggle(db, pid, user, "reporte")
    p.reports = db.scalar(select(func.count(PostReaction.id)).where(PostReaction.post_id == pid, PostReaction.kind == "reporte"))
    p.hidden = p.reports >= HIDE_AT
    db.commit()
    return {"id": p.id, "hidden": p.hidden, "message": "Gracias. Revisaremos la publicación."}


@router.delete("/{pid}")
def remove(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Post, pid)
    if p is None:
        raise HTTPException(404, "Publicación no encontrada.")
    if p.user_id != user.id and user.role != "admin":
        raise HTTPException(403, "Solo el autor o un administrador puede borrarla.")
    ids = [p.id] + list(db.scalars(select(Post.id).where(Post.parent_id == p.id)))
    db.execute(delete(PostReaction).where(PostReaction.post_id.in_(ids)))
    db.execute(delete(Post).where(Post.parent_id == p.id))
    db.delete(p)
    db.commit()
    return {"deleted": True}
