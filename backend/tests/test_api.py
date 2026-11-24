import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.db import Base, get_db
from app.main import app
from app.models import Space, Configuration

@pytest.fixture
def client():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Configure TEST_DATABASE_URL con una base PostgreSQL exclusiva para pruebas")
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    with engine.connect() as connection:
        outer = connection.begin()
        with Session(bind=connection, join_transaction_mode="create_savepoint") as session:
            session.add_all([Space(code="TEST-A1", row_index=0, col_index=0), Space(code="TEST-B1", row_index=0, col_index=1), Configuration(id=1)])
            session.commit()
            def override():
                yield session
            app.dependency_overrides[get_db] = override
            with TestClient(app) as test_client:
                yield test_client
            app.dependency_overrides.clear()
        outer.rollback()
    engine.dispose()

def test_entry_exit_and_history(client):
    space = next(s for s in client.get("/api/espacios").json() if s["code"] == "TEST-A1")
    entered = client.post("/api/entradas", json={"plate":"abc-123", "space_id":space["id"]})
    assert entered.status_code == 201, entered.text
    assert entered.json()["plate"] == "ABC123"
    assert client.post("/api/entradas", json={"plate":"ABC123"}).status_code == 409
    assert next(s for s in client.get("/api/espacios").json() if s["code"] == "TEST-A1")["status"] == "ocupado"
    assert client.get("/api/dashboard/resumen").json()["inside"] >= 1
    assert client.post("/api/salidas", json={"plate":"ABC123"}).status_code == 200
    assert next(s for s in client.get("/api/espacios").json() if s["code"] == "TEST-A1")["status"] == "disponible"
    assert client.post("/api/salidas", json={"plate":"ABC123"}).status_code == 404
    history = client.get("/api/sesiones?plate=ABC123&status=finalizado").json()
    assert history["total"] == 1
    assert "ABC123" in client.get("/api/sesiones/exportar?plate=ABC123").text

def test_space_conflict_and_validation(client):
    space = next(s for s in client.get("/api/espacios").json() if s["code"] == "TEST-A1")
    assert client.post("/api/entradas", json={"plate":"!"}).status_code == 422
    assert client.post("/api/entradas", json={"plate":"DEF456", "space_id":space["id"]}).status_code == 201
    assert client.post("/api/entradas", json={"plate":"GHI789", "space_id":space["id"]}).status_code == 409
    assert client.patch(f"/api/espacios/{space['id']}", json={"out_of_service":True}).status_code == 409

def test_recognition_unavailable(client):
    from app.ai import state
    if state()["available"]:
        pytest.skip("Hay modelos presentes")
    result = client.post("/api/reconocimiento/procesar", files={"file":("placa.jpg", b"test", "image/jpeg")})
    assert result.status_code == 503

def test_plate_preview_and_confirm(client):
    first = client.get("/api/placas/preparar/JMZ-247")
    assert first.status_code == 200
    assert first.json()["action"] == "entrada"
    assert first.json()["suggested_space"]["code"] == "TEST-A1"
    enter = client.post("/api/placas/confirmar", json={"plate":"JMZ247", "expected_action":"entrada"})
    assert enter.status_code == 200, enter.text
    assert enter.json()["session"]["space_code"] == "TEST-A1"
    second = client.get("/api/placas/preparar/JMZ247")
    assert second.json()["action"] == "salida"
    assert second.json()["active_session"]["space_code"] == "TEST-A1"
    stale = client.post("/api/placas/confirmar", json={"plate":"JMZ247", "expected_action":"entrada"})
    assert stale.status_code == 409
    exit_response = client.post("/api/placas/confirmar", json={"plate":"JMZ247", "expected_action":"salida"})
    assert exit_response.status_code == 200
    assert client.get("/api/placas/preparar/JMZ247").json()["action"] == "entrada"

def test_spanish_response_encoding(client):
    response = client.get("/api/placas/preparar/!")
    assert response.status_code == 422
    assert "caracteres" in response.json()["detail"]

def test_floor_positions_persist(client):
    item = client.post("/api/espacios", json={"code":"TEST-C1", "row_index":1, "col_index":0})
    assert item.status_code == 201, item.text
    first = next(s for s in client.get("/api/espacios").json() if s["code"] == "TEST-A1")
    moved = client.patch(f"/api/espacios/{first['id']}", json={"row_index":1, "col_index":0})
    assert moved.status_code == 200, moved.text
    result = {s["code"]:(s["row_index"],s["col_index"]) for s in client.get("/api/espacios").json()}
    assert result["TEST-A1"] == (1,0)
    assert result["TEST-C1"] == (0,0)
    assert client.patch("/api/configuracion", json={"layout_rows":1}).status_code == 409
