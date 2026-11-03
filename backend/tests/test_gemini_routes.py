import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


@pytest.fixture
def client(monkeypatch, tmp_path):
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_token", "test-admin-token")
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "gateway.sqlite3"))
    return TestClient(app)


def test_gemini_image_route_requires_admin(client):
    response = client.post("/api/v1/providers/gemini/images", json={"prompt": "hello"})
    assert response.status_code == 401


def test_gemini_image_route_rejects_unknown_fields(client):
    response = client.post(
        "/api/v1/providers/gemini/images",
        headers={"Authorization": "Bearer test-admin-token"},
        json={"prompt": "hello", "api_key": "should-not-be-accepted"},
    )
    assert response.status_code == 422
    assert "should-not-be-accepted" not in response.text


def test_gemini_image_route_rejects_unsupported_model(client):
    response = client.post(
        "/api/v1/providers/gemini/images",
        headers={"Authorization": "Bearer test-admin-token"},
        json={"prompt": "hello", "model": "untrusted/arbitrary"},
    )
    assert response.status_code == 422
