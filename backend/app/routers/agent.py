"""Pacha IA: agente por voz y texto."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.ratelimit import chat_limiter, client_key
from app.db import get_db
from app.deps import optional_user
from app.models import User
from app.schemas import AgentChatIn
from app.services import agent

router = APIRouter(prefix="/api/ai/agent", tags=["pacha ia"])


@router.get("/status")
def status():
    s = get_settings()
    prov = "claude" if s.anthropic_api_key else "grok" if s.xai_api_key else "gemini" if s.gemini_api_key else "local"
    return {"status": "ready", "agent_name": "Pacha IA",
            "provider": prov,
            "model": {"claude": s.assistant_model, "grok": s.xai_model, "gemini": s.gemini_model}.get(prov),
            "last_error": agent.LAST_ERROR.get(prov),
            "backup": [p for p, k in (("grok", s.xai_api_key), ("gemini", s.gemini_api_key)) if k and p != prov],
            "voice": "navegador (Web Speech API)"}


@router.post("/chat")
def chat(body: AgentChatIn, request: Request, user: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    chat_limiter.check(client_key(request))
    return agent.chat(db, body.message, body.municipality_id, body.lat, body.lon, body.crop,
                      [h.model_dump() for h in body.history], user)
