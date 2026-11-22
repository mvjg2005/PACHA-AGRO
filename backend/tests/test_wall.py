from tests.conftest import admin_headers, register


def post(c, h, text="¿Alguien sabe si va a nevar esta semana?", kind="pregunta", muni="or-challapata", parent=None):
    return c.post("/api/muro", headers=h, json={"text": text, "kind": kind, "municipality_id": muni, "parent_id": parent})


def test_everyone_sees_posts_without_account_and_no_phone(app_client):
    h = register(app_client, "71110001", "Rosa Quispe Mamani")
    r = post(app_client, h)
    assert r.status_code == 201, r.text
    feed = app_client.get("/api/muro").json()
    item = feed["items"][0]
    assert item["author"] == "Rosa Q." and item["municipality_name"] == "Challapata" and item["kind_label"] == "Pregunta"
    assert "71110001" not in str(feed) and item["can_delete"] is False
    assert app_client.get("/api/muro?municipality_id=or-challapata").json()["items"]
    assert app_client.get("/api/muro?department_id=santa-cruz").json()["items"] == []


def test_posting_requires_account(app_client):
    assert post(app_client, {}).status_code == 401


def test_replies_and_useful_toggle(app_client):
    a = register(app_client, "71110002", "Rosa Quispe")
    b = register(app_client, "71110003", "Juan Condori")
    pid = post(app_client, a).json()["id"]
    assert post(app_client, b, "Sí, el jueves dicen que baja la temperatura.", parent=pid).status_code == 201
    assert app_client.get("/api/muro").json()["items"][0]["replies"] == 1
    assert app_client.get(f"/api/muro/{pid}/respuestas").json()[0]["author"] == "Juan C."
    r = app_client.post(f"/api/muro/{pid}/me-sirve", headers=b).json()
    assert r["useful"] == 1 and r["useful_by_me"]
    assert app_client.post(f"/api/muro/{pid}/me-sirve", headers=b).json()["useful"] == 0


def test_three_reports_hide_and_author_or_admin_can_delete(app_client):
    a = register(app_client, "71110004", "Autor Uno")
    pid = post(app_client, a, "Vendo forraje de cebada en Challapata", kind="venta").json()["id"]
    assert app_client.post(f"/api/muro/{pid}/reportar", headers=a).status_code == 422
    for i in range(3):
        h = register(app_client, f"7111001{i}", f"Persona {'ABC'[i]}")
        app_client.post(f"/api/muro/{pid}/reportar", headers=h)
    assert app_client.get("/api/muro").json()["items"] == []
    pid2 = post(app_client, a, "Otra publicación").json()["id"]
    other = register(app_client, "71110020", "Otro Usuario")
    assert app_client.delete(f"/api/muro/{pid2}", headers=other).status_code == 403
    assert app_client.delete(f"/api/muro/{pid2}", headers=admin_headers(app_client)).status_code == 200


def test_admin_created_community_is_approved(app_client):
    r = app_client.post("/api/communities", headers=admin_headers(app_client),
                        json={"name": "Comunidad Prueba", "municipality_id": "or-challapata", "description": ""})
    assert r.status_code == 201 and r.json()["status"] == "approved"
