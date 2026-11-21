"""Datos iniciales. Las cuentas y la comunidad de demostración son FICTICIAS y están marcadas is_demo=True."""
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.core.time import local_now
from app.models import Community, Meeting, Membership, Notice, User, utcnow

DEMO_PASSWORD = "demo1234"
DEMO_USERS = [
    ("+59170000001", "Representante Demo", "representative"),
    ("+59170000002", "Agricultora Demo", "member"),
]


def _demo_data_complete(db: Session) -> bool:
    user_ids = list(db.scalars(select(User.id).where(User.is_demo.is_(True))))
    community_id = db.scalar(select(Community.id).where(Community.is_demo.is_(True)))
    if len(user_ids) != len(DEMO_USERS) or community_id is None:
        return False
    memberships = db.scalar(select(func.count(Membership.id)).where(
        Membership.community_id == community_id,
        Membership.user_id.in_(user_ids),
        Membership.status == "approved",
    )) or 0
    meetings = db.scalar(select(func.count(Meeting.id)).where(Meeting.community_id == community_id)) or 0
    notices = db.scalar(select(func.count(Notice.id)).where(Notice.community_id == community_id)) or 0
    return memberships == len(DEMO_USERS) and meetings >= 1 and notices >= 1


def seed(db: Session) -> None:
    s = get_settings()

    if s.admin_password and not db.scalar(select(User.id).where(User.phone == s.admin_phone)):
        db.add(User(
            full_name="Administrador",
            phone=s.admin_phone,
            password_hash=hash_password(s.admin_password),
            role="admin",
        ))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            if not db.scalar(select(User.id).where(User.phone == s.admin_phone)):
                raise

    if not s.seed_demo:
        return
    if db.scalar(select(User.id).where(User.is_demo.is_(True))) or db.scalar(
        select(Community.id).where(Community.is_demo.is_(True))
    ):
        if _demo_data_complete(db):
            return
        raise RuntimeError(
            "Los datos demo existentes están incompletos. Revise las cuentas, comunidad, membresías y contenido demo antes de iniciar."
        )

    users = []
    for phone, name, _ in DEMO_USERS:
        user = User(
            full_name=name,
            phone=phone,
            password_hash=hash_password(DEMO_PASSWORD),
            is_demo=True,
            whatsapp_opt_in=True,
            whatsapp_opt_in_at=utcnow(),
            default_municipality_id="or-challapata",
        )
        db.add(user)
        users.append(user)

    try:
        db.flush()
        community = Community(
            name="Comunidad Demo Challapata",
            department_id="oruro",
            municipality_id="or-challapata",
            status="approved",
            is_demo=True,
            created_by=users[0].id,
            description="Comunidad FICTICIA para demostrar el prototipo.",
        )
        db.add(community)
        db.flush()

        for user, (_, _, role) in zip(users, DEMO_USERS):
            db.add(Membership(user_id=user.id, community_id=community.id, role=role, status="approved"))

        starts = (local_now() + timedelta(days=3)).replace(
            hour=10, minute=0, second=0, microsecond=0
        )
        db.add(Meeting(
            community_id=community.id,
            title="Planificación de siembra de quinua",
            place="Sede de la comunidad",
            description="Revisaremos el pronóstico y organizaremos la siembra.",
            starts_at=starts,
            created_by=users[0].id,
        ))
        db.add(Notice(
            community_id=community.id,
            title="Bienvenidos a la comunidad demo",
            category="general",
            author_id=users[0].id,
            body="Este es un aviso de demostración. Aquí el representante publica información para todos.",
        ))
        db.commit()
    except IntegrityError:
        db.rollback()
        if not _demo_data_complete(db):
            raise
