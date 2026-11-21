"""Datos iniciales. Las cuentas y la comunidad de demostración son FICTICIAS y están marcadas is_demo=True."""
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.models import Community, Expert, Meeting, Membership, Notice, RegionalNotice, SenaObservation, User

DEMO_PASSWORD = "demo1234"
DEMO_USERS = [
    ("+59170000001", "Representante Demo", "representative"),
    ("+59170000002", "Agricultora Demo", "member"),
]


def seed(db: Session) -> None:
    s = get_settings()
    if s.admin_password and not db.scalar(select(User).where(User.phone == s.admin_phone)):
        db.add(User(full_name="Administrador", phone=s.admin_phone, password_hash=hash_password(s.admin_password), role="admin"))
        db.commit()
    if not s.seed_demo:
        return
    existing = db.scalar(select(User).where(User.is_demo.is_(True)).order_by(User.id))
    if existing:
        # Base creada con una versión anterior: agrega solo lo nuevo (avisos regionales DEMO).
        if not db.scalar(select(RegionalNotice).where(RegionalNotice.is_demo.is_(True))):
            seed_regional_notices(db, existing.id)
            db.commit()
        if not db.scalar(select(SenaObservation).where(SenaObservation.is_demo.is_(True))):
            seed_senas(db, [u.id for u in db.scalars(select(User).where(User.is_demo.is_(True)).order_by(User.id))])
            db.commit()
        return
    users = []
    for phone, name, _ in DEMO_USERS:
        u = User(full_name=name, phone=phone, password_hash=hash_password(DEMO_PASSWORD), is_demo=True,
                 whatsapp_opt_in=True, whatsapp_opt_in_at=datetime.now(), default_municipality_id="or-challapata",
                 crop_interests="quinua")
        db.add(u)
        users.append(u)
    db.flush()
    c = Community(name="Comunidad Demo Challapata", department_id="oruro", municipality_id="or-challapata", status="approved",
                  is_demo=True, created_by=users[0].id, description="Comunidad FICTICIA para demostrar el prototipo.")
    db.add(c)
    db.flush()
    for u, (_, _, role) in zip(users, DEMO_USERS):
        db.add(Membership(user_id=u.id, community_id=c.id, role=role, status="approved"))
    start = (datetime.now() + timedelta(days=3)).replace(hour=10, minute=0, second=0, microsecond=0)
    db.add(Meeting(community_id=c.id, title="Planificación de siembra de quinua", place="Sede de la comunidad",
                   description="Revisaremos el pronóstico y organizaremos la siembra.", starts_at=start, created_by=users[0].id))
    db.add(Notice(community_id=c.id, title="Bienvenidos a la comunidad demo", category="general", author_id=users[0].id,
                  body="Este es un aviso de demostración. Aquí el representante publica información para todos."))
    seed_regional_notices(db, users[0].id)
    # Técnico FICTICIO solo para la demostración (no se muestra con SEED_DEMO=false).
    db.add(Expert(full_name="Técnico de ejemplo (DEMO)", specialty="Manejo de quinua y heladas", institution="Cuenta de demostración",
                  phone="+59170000003", crops="quinua,papa", departments="oruro,potosi,la-paz", consent=True, verified=False, is_demo=True))
    seed_senas(db, [u.id for u in users])
    db.commit()


# Señas FICTICIAS de demostración (Challapata). Lo que pasó en cada campaña NO es ficticio: lo calcula
# la plataforma con datos de NASA POWER. Solo se cargan con SEED_DEMO=true.
DEMO_SENAS = [
    (2023, "qutu", "brillante", "2023-06-24"), (2023, "atoq", "claro", "2023-08-10"), (2023, "leque", "bajo", "2023-09-15"),
    (2024, "qutu", "opaca", "2024-06-24"), (2024, "leque", "alto", "2024-09-20"), (2024, "floracion", "abundante", "2024-10-02"),
    (2024, "jampatu", "callados", "2024-10-05"),
    (2025, "qutu", "opaca", "2025-06-24"), (2025, "atoq", "ronco", "2025-08-12"), (2025, "floracion", "escasa", "2025-09-30"),
    (2025, "leque", "alto", "2025-09-18"),
    (2026, "qutu", "brillante", "2026-06-24"), (2026, "leque", "alto", "2026-09-14"), (2026, "atoq", "claro", "2026-08-05"),
]


def seed_senas(db: Session, user_ids: list[int]) -> None:
    from datetime import date
    for i, (campaign, sena_id, reading, day) in enumerate(DEMO_SENAS):
        if date.fromisoformat(day) > date.today():
            continue
        db.add(SenaObservation(user_id=user_ids[i % len(user_ids)], sena_id=sena_id, reading=reading, municipality_id="or-challapata",
                               department_id="oruro", campaign=campaign, observed_on=day,
                               notes="Registro de demostración", is_demo=True))


def seed_regional_notices(db: Session, author_id: int) -> None:
    """Avisos regionales de DEMOSTRACIÓN (ficticios, basados en los ejemplos de PACHAAGRO)."""
    exp = datetime.now() + timedelta(days=20)
    demo = [
        ("nacional", {}, "aviso", "Actualice sus cultivos de interés",
         "Marque en su perfil qué cultivos produce para recibir solo los avisos que le corresponden."),
        ("departamento", {"department_id": "oruro"}, "clima", "Ejemplo: noches frías en el altiplano orureño",
         "Ejemplo DEMO de aviso de clima. Revise la temperatura mínima antes de sembrar y proteja almácigos."),
        ("cultivo", {"crop_id": "papa"}, "comunicado", "Revisión preventiva de riego antes de la campaña de papa",
         "Ejemplo DEMO: revise canales y mangueras antes de la siembra para no perder agua."),
        ("departamento", {"department_id": "cochabamba"}, "evento", "Ejemplo: feria de semillas nativas en Cochabamba",
         "Ejemplo DEMO de evento departamental para intercambio de semillas."),
    ]
    for scope, fields, kind, title, summary in demo:
        db.add(RegionalNotice(scope=scope, kind=kind, title=title, summary=summary, is_demo=True,
                              author_id=author_id, expires_at=exp, **fields))
