import base64

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.providers.gemini import GeminiAdapterError, GeminiImageAdapter


@pytest.fixture
def configured_gateway(tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_token", "test-admin-token")
    monkeypatch.setattr(settings, "secret_encryption_key", Fernet.generate_key().decode("ascii"))
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "gateway.sqlite3"))
    from app.providers.vault import store_credential
    store_credential("gemini", "test-gemini-api-key-123")
    return TestClient(app)


def test_gemini_connection_requires_admin(configured_gateway):
    response = configured_gateway.post("/api/v1/providers/gemini/test")
    assert response.status_code == 401


def test_gemini_connection_success(configured_gateway, monkeypatch):
    def handler(request):
        assert request.headers["x-goog-api-key"] == "test-gemini-api-key-123"
        return httpx.Response(200, json={"name": "models/gemini-nano-banana-2.1"})
    client = httpx.Client(transport=httpx.MockTransport(handler))
    monkeypatch.setattr("app.providers.gemini_routes.GeminiImageAdapter", lambda: GeminiImageAdapter(client))
    response = configured_gateway.post(
        "/api/v1/providers/gemini/test",
        headers={"Authorization": "Bearer test-admin-token"},
    )
    assert response.status_code == 200
    assert response.json()["available"] is True
    assert "test-gemini-api-key-123" not in response.text


def test_generate_image_sends_expected_interactions_request():
    captured = {}
    def handler(request):
        captured["body"] = request.read()
        captured["headers"] = request.headers
        return httpx.Response(200, json={
            "id": "interaction-123",
            "output_image": {"mime_type": "image/png", "data": base64.b64encode(b"png-data").decode("ascii")},
        })
    client = httpx.Client(transport=httpx.MockTransport(handler))
    adapter = GeminiImageAdapter(client)
    import app.providers.gemini as gemini
    original = gemini._api_key
    gemini._api_key = lambda: "test-gemini-api-key-123"
    try:
        result = adapter.generate_image("A product photo")
    finally:
        gemini._api_key = original
    assert result["interaction_id"] == "interaction-123"
    assert result["image"]["mime_type"] == "image/png"
    assert captured["headers"]["x-goog-api-key"] == "test-gemini-api-key-123"
    assert b"test-gemini-api-key-123" not in captured["body"]


def test_generate_image_supports_editing_input():
    captured = {}
    image = b"source-image"
    encoded = base64.b64encode(image).decode("ascii")
    def handler(request):
        captured["body"] = request.read()
        return httpx.Response(200, json={
            "id": "edit-123",
            "output_image": {"mime_type": "image/jpeg", "data": base64.b64encode(b"edited").decode("ascii")},
        })
    client = httpx.Client(transport=httpx.MockTransport(handler))
    adapter = GeminiImageAdapter(client)
    import app.providers.gemini as gemini
    original = gemini._api_key
    gemini._api_key = lambda: "test-gemini-api-key-123"
    try:
        result = adapter.generate_image("Remove the background", image_base64=encoded, mime_type="image/png")
    finally:
        gemini._api_key = original
    assert result["interaction_id"] == "edit-123"
    assert encoded.encode("ascii") in captured["body"]


def test_upstream_invalid_key_is_sanitized():
    client = httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(403, json={"error": {"message": "secret details"}})))
    adapter = GeminiImageAdapter(client)
    import app.providers.gemini as gemini
    original = gemini._api_key
    gemini._api_key = lambda: "bad-key"
    try:
        with pytest.raises(GeminiAdapterError) as error:
            adapter.test_connection()
    finally:
        gemini._api_key = original
    assert error.value.code == "INVALID_CREDENTIAL"
    assert "secret details" not in str(error.value)


def test_invalid_image_base64_is_rejected():
    import app.providers.gemini as gemini
    original = gemini._api_key
    gemini._api_key = lambda: "test-key"
    try:
        adapter = GeminiImageAdapter(httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json={}))))
        with pytest.raises(GeminiAdapterError) as error:
            adapter.generate_image("edit", image_base64="not-base64!", mime_type="image/png")
    finally:
        gemini._api_key = original
    assert error.value.code == "INVALID_IMAGE_DATA"
