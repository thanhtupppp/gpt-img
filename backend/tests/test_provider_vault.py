from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.providers.vault import _load_credential_for_provider_execution, store_credential
import sqlite3


@pytest.fixture
def configured_gateway(tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_token", "test-admin-token")
    monkeypatch.setattr(settings, "secret_encryption_key", Fernet.generate_key().decode("ascii"))
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "gateway.sqlite3"))
    return TestClient(app)


def test_provider_list_requires_admin_auth(configured_gateway):
    response = configured_gateway.get("/api/v1/providers")
    assert response.status_code == 401


def test_provider_list_returns_catalog_without_credentials(configured_gateway):
    response = configured_gateway.get(
        "/api/v1/providers",
        headers={"Authorization": "Bearer test-admin-token"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert [item["id"] for item in payload["items"]] == ["gemini", "openai", "anthropic"]
    assert all(item["credential_configured"] is False for item in payload["items"])
    assert "api_key" not in response.text


def test_credential_is_encrypted_and_never_returned(configured_gateway):
    secret = "test-secret-api-key-123"
    response = configured_gateway.put(
        "/api/v1/providers/gemini/credentials",
        headers={"Authorization": "Bearer test-admin-token"},
        json={"api_key": secret},
    )
    assert response.status_code == 204

    stored = configured_gateway.get(
        "/api/v1/providers",
        headers={"Authorization": "Bearer test-admin-token"},
    )
    assert stored.status_code == 200
    assert secret not in stored.text
    assert stored.json()["items"][0]["credential_configured"] is True
    assert _load_credential_for_provider_execution("gemini") == secret
    with sqlite3.connect(get_settings().database_path) as connection:
        encrypted = connection.execute(
            "SELECT encrypted_api_key FROM provider_credentials WHERE provider_id = ?",
            ("gemini",),
        ).fetchone()[0]
    assert secret.encode("utf-8") not in bytes(encrypted)


def test_credential_delete_removes_secret(configured_gateway):
    store_credential("openai", "test-secret-api-key-456")
    response = configured_gateway.delete(
        "/api/v1/providers/openai/credentials",
        headers={"Authorization": "Bearer test-admin-token"},
    )
    assert response.status_code == 204
    assert _load_credential_for_provider_execution("openai") is None


def test_unknown_provider_is_rejected(configured_gateway):
    response = configured_gateway.put(
        "/api/v1/providers/unknown/credentials",
        headers={"Authorization": "Bearer test-admin-token"},
        json={"api_key": "test-secret-api-key"},
    )
    assert response.status_code == 404


def test_extra_credential_fields_are_rejected_without_echo(configured_gateway):
    secret = "test-secret-api-key-789"
    response = configured_gateway.put(
        "/api/v1/providers/gemini/credentials",
        headers={"Authorization": "Bearer test-admin-token"},
        json={"api_key": secret, "debug": secret},
    )
    assert response.status_code == 422
    assert secret not in response.text


def test_invalid_encryption_key_is_rejected(configured_gateway, monkeypatch):
    monkeypatch.setattr(get_settings(), "secret_encryption_key", "not-a-fernet-key")
    response = configured_gateway.put(
        "/api/v1/providers/gemini/credentials",
        headers={"Authorization": "Bearer test-admin-token"},
        json={"api_key": "test-secret-api-key"},
    )
    assert response.status_code == 503
