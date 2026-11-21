from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.time import local_now, local_today
from app.data.catalog import crops_config
from app.models import Community, Observation, User
from app.services.recommendation.builder import weather_view
from app.services.recommendation.engine import Answers, evaluate
from app.services.weather.service import get_weather


def community_reports(db: Session, municipality_id: str, kind: str, days: int = 7) -> int:
    since = local_now() - timedelta(days=days)
    query = (select(func.count(Observation.id))
        .join(Community, Observation.community_id == Community.id)
        .join(User, Observation.user_id == User.id)
        .where(
            Observation.municipality_id == municipality_id,
            Observation.kind == kind,
            Observation.review_status == "confirmada",
            Observation.observed_at >= since,
            Community.status == "approved",
            User.is_active.is_(True),
        ))
    if not get_settings().seed_demo:
        query = (query.join(Community, Observation.community_id == Community.id)
                 .join(User, Observation.user_id == User.id)
                 .where(Community.is_demo.is_(False), User.is_demo.is_(False)))
    return db.scalar(query) or 0


def recommend(db: Session, municipality: dict, answers: Answers, mode: str = "real", today: date | None = None) -> dict:
    today = today or local_today()
    wx = get_weather(municipality, mode, today)
    view = weather_view(wx, community_reports(db, municipality["id"], "granizo"), community_reports(db, municipality["id"], "helada"))
    result = evaluate(crops_config(), municipality, answers, view, today)
    result["weather_summary"] = {
        "forecast_available": wx["forecast"]["available"], "forecast_error": wx["forecast"]["error"],
        "forecast_source": wx["forecast"]["source"], "recent_source": wx["recent"]["source"] if wx["recent"]["available"] else None,
        "fetched_at": wx["forecast"]["fetched_at"],
    }
    return result
