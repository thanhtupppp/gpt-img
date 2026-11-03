from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.bridge import security
from app.main import app

client = TestClient(app)


def test_bridge_requires_configuration(monkeypatch):
    monkeypatch.setattr(security, "get_settings", lambda: SimpleNamespace(bridge_token=""))

    response = client.get("/api/v1/bridge/capabilities")

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "BRIDGE_AUTH_NOT_CONFIGURED"


def test_bridge_rejects_missing_or_invalid_bearer_token(monkeypatch):
    monkeypatch.setattr(security, "get_settings", lambda: SimpleNamespace(bridge_token="bridge-secret"))

    missing = client.get("/api/v1/bridge/capabilities")
    invalid = client.get(
        "/api/v1/bridge/capabilities",
        headers={"Authorization": "Bearer wrong-secret"},
    )

    assert missing.status_code == 401
    assert invalid.status_code == 401
    assert missing.headers["www-authenticate"] == "Bearer"


def test_bridge_capabilities_are_available_with_bridge_token(monkeypatch):
    monkeypatch.setattr(security, "get_settings", lambda: SimpleNamespace(bridge_token="bridge-secret"))

    response = client.get(
        "/api/v1/bridge/capabilities",
        headers={"Authorization": "Bearer bridge-secret"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "service": "piecs-bridge",
        "api_version": "v1",
        "package_schema_versions": [],
        "capabilities": {
            "capability_discovery": True,
            "prompt_package_import": False,
            "prompt_package_export": False,
            "workflow_submission": False,
            "execution_status": False,
            "webhooks": False,
        },
    }


def test_bridge_token_is_independent_from_admin_token(monkeypatch):
    monkeypatch.setattr(security, "get_settings", lambda: SimpleNamespace(bridge_token="bridge-secret"))

    response = client.get(
        "/api/v1/bridge/capabilities",
        headers={"Authorization": "Bearer admin-secret"},
    )

    assert response.status_code == 401
