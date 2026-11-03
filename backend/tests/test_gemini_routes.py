from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


def test_gemini_image_route_rejects_unknown_fields():
    settings = get_settings()
    from app.providers.vault import store_credential
    settings.admin_token = "test-admin-token"
    settings.secret_encryption_key = Fernet.generate_key().decode("ascii")
    settings.database_path = ":memory:"
    client = TestClient(app)
    response = client.post(
        "/api/v1/providers/gemini/images",
        headers={"Authorization": "Bearer test-admin-token"},
        json={"prompt": "hello", "api_key": "should-not-be-accepted"},
    )
    assert response.status_code == 422
    assert "should-not-be-accepted" not in response.text


def test_gemini_image_route_rejects_unsupported_model():
    settings = get_settings()
    settings.admin_token = "test-admin-token"
    client = TestClient(app)
    response = client.post(
        "/api/v1/providers/gemini/images",
        headers={"Authorization": "Bearer test-admin-token"},
        json={"prompt": "hello", "model": "untrusted/arbitrary"},
    )
    assert response.status_code == 422
