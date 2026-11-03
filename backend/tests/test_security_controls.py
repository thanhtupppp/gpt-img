from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.bridge import security as bridge_security, store as bridge_store, worker_store
from app.main import app
from app import security_controls
from app.providers import security as admin_security


client = TestClient(app)


def configure(monkeypatch, tmp_path, *, limit=120):
    path = str(tmp_path / "security.sqlite3")
    settings = SimpleNamespace(
        database_path=path,
        rate_limit_requests=limit,
        rate_limit_window_seconds=60,
    )
    monkeypatch.setattr(security_controls, "get_settings", lambda: settings)
    return path


def test_rate_limit_is_persistent_and_identity_scoped(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path, limit=2)

    security_controls.enforce_rate_limit("issuer|alice", category="oidc-user")
    security_controls.enforce_rate_limit("issuer|alice", category="oidc-user")
    with pytest.raises(Exception) as caught:
        security_controls.enforce_rate_limit("issuer|alice", category="oidc-user")
    assert getattr(caught.value, "status_code", None) == 429

    # A different validated identity has an independent bucket.
    security_controls.enforce_rate_limit("issuer|bob", category="oidc-user")


def test_audit_events_store_metadata_and_hash_actor_identity(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path)
    security_controls.record_audit_event(
        request_id="request-123",
        actor_type="oidc_user",
        actor_identity="https://issuer.example.test/|alice",
        workspace_id="workspace-123",
        action="write",
        route="/api/v1/workspaces/{workspace_id}/bridge/workflows",
        method="POST",
        status_code=202,
        duration_ms=17,
    )

    result = security_controls.list_audit_events(limit=10)
    assert result["total"] == 1
    event = result["items"][0]
    assert event["requestId"] == "request-123"
    assert event["actorType"] == "oidc_user"
    assert event["actorHash"] != "https://issuer.example.test/|alice"
    assert event["workspaceId"] == "workspace-123"
    assert event["statusCode"] == 202
    assert "prompt" not in str(event).lower()
    assert "authorization" not in str(event).lower()


def test_bridge_requests_are_rate_limited_and_audited(monkeypatch, tmp_path):
    path = configure(monkeypatch, tmp_path, limit=1)
    monkeypatch.setattr(
        bridge_security, "get_settings",
        lambda: SimpleNamespace(bridge_token="bridge-secret-test"),
    )
    monkeypatch.setattr(
        bridge_store, "get_settings",
        lambda: SimpleNamespace(database_path=path),
    )
    monkeypatch.setattr(
        worker_store, "get_settings",
        lambda: SimpleNamespace(database_path=path),
    )
    headers = {"Authorization": "Bearer bridge-secret-test"}

    first = client.get("/api/v1/bridge/capabilities", headers=headers)
    second = client.get("/api/v1/bridge/capabilities", headers=headers)

    assert first.status_code == 200
    assert first.headers["x-request-id"]
    assert second.status_code == 429
    assert second.headers["retry-after"]

    events = security_controls.list_audit_events(limit=10)
    assert events["total"] == 2
    assert events["items"][0]["actorType"] == "bridge_service"
    assert all("bridge-secret-test" not in str(item) for item in events["items"])


def test_audit_log_api_requires_admin_service_token(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path)
    security_controls.record_audit_event(
        request_id="seed",
        actor_type="anonymous",
        actor_identity=None,
        workspace_id=None,
        action="read",
        route="/healthz",
        method="GET",
        status_code=200,
        duration_ms=1,
    )
    monkeypatch.setattr(
        admin_security, "get_settings",
        lambda: SimpleNamespace(admin_token="admin-secret-test"),
    )

    denied = client.get("/api/v1/admin/audit-logs")
    allowed = client.get(
        "/api/v1/admin/audit-logs",
        headers={"Authorization": "Bearer admin-secret-test"},
    )
    assert denied.status_code == 401
    assert allowed.status_code == 200
    assert allowed.json()["total"] >= 1
    assert "admin-secret-test" not in allowed.text
