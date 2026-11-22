"""Pacha IA: agente por voz y texto."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.ratelimit import chat_limiter, client_key
from app.db import get_db
from app.deps import optional_user
from app.models import User
from app.schemas import AgentChatIn
from app.services import agent

router = APIRouter(prefix="/api/ai/agent", tags=["pacha ia"])


@router.get("/status")
def status():
    keys = agent.provider_keys()
    active = [p for p, k in keys.items() if k]
    prov = active[0] if active else "local"
    return {"status": "ready", "agent_name": "Pacha IA",
            "provider": prov,
            "model": agent.provider_model(prov) if active else None,
            "last_error": agent.LAST_ERROR.get(prov),
            "backup": active[1:],
            "backup_errors": {p: agent.LAST_ERROR[p] for p in active[1:]},
            "key_hint": {p: agent.key_hint(keys[p]) for p in active},
            "voice": "navegador (Web Speech API)"}


@router.post("/chat")
def chat(body: AgentChatIn, request: Request, user: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    chat_limiter.check(client_key(request))
    return agent.chat(db, body.message, body.municipality_id, body.lat, body.lon, body.crop,
                      [h.model_dump() for h in body.history], user)
