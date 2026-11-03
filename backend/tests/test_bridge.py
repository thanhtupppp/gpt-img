from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.bridge import security, store
from app.main import app

client = TestClient(app)
AUTH = {"Authorization": "Bearer bridge-secret"}


def configure_bridge(monkeypatch, tmp_path):
    monkeypatch.setattr(security, "get_settings", lambda: SimpleNamespace(bridge_token="bridge-secret"))
    monkeypatch.setattr(store, "get_settings", lambda: SimpleNamespace(database_path=str(tmp_path / "bridge.sqlite3")))


def test_bridge_requires_configuration(monkeypatch):
    monkeypatch.setattr(security, "get_settings", lambda: SimpleNamespace(bridge_token=""))
    response = client.get("/api/v1/bridge/capabilities")
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "BRIDGE_AUTH_NOT_CONFIGURED"


def test_bridge_rejects_missing_or_invalid_bearer_token(monkeypatch):
    monkeypatch.setattr(security, "get_settings", lambda: SimpleNamespace(bridge_token="bridge-secret"))
    missing = client.get("/api/v1/bridge/capabilities")
    invalid = client.get("/api/v1/bridge/capabilities", headers={"Authorization": "Bearer wrong-secret"})
    assert missing.status_code == 401
    assert invalid.status_code == 401
    assert missing.headers["www-authenticate"] == "Bearer"


def test_bridge_token_is_independent_from_admin_token(monkeypatch):
    monkeypatch.setattr(security, "get_settings", lambda: SimpleNamespace(bridge_token="bridge-secret"))
    response = client.get("/api/v1/bridge/capabilities", headers={"Authorization": "Bearer admin-secret"})
    assert response.status_code == 401


def test_bridge_capabilities_report_only_implemented_features(monkeypatch):
    monkeypatch.setattr(security, "get_settings", lambda: SimpleNamespace(bridge_token="bridge-secret"))
    response = client.get("/api/v1/bridge/capabilities", headers=AUTH)
    assert response.status_code == 200
    assert response.json()["package_schema_versions"] == ["1.0.0"]
    assert response.json()["capabilities"] == {
        "capability_discovery": True,
        "prompt_package_import": True,
        "prompt_package_export": True,
        "workflow_submission": True,
        "execution_status": True,
        "workflow_execution_worker": False,
        "webhooks": False,
    }


def test_prompt_package_import_and_export_round_trip(monkeypatch, tmp_path):
    configure_bridge(monkeypatch, tmp_path)
    package = {
        "format": "piecs-prompt-package",
        "packageVersion": "1.0.0",
        "exportedAt": "2026-11-03T00:00:00Z",
        "templates": [{"id": "template-1", "name": "Test"}],
        "workflows": [],
        "workflowGraphs": [],
    }
    imported = client.post("/api/v1/bridge/packages", json=package, headers=AUTH)
    assert imported.status_code == 201
    package_id = imported.json()["id"]
    exported = client.get(f"/api/v1/bridge/packages/{package_id}", headers=AUTH)
    assert exported.status_code == 200
    assert exported.json()["package"] == package


def test_prompt_package_rejects_secrets_and_unsupported_versions(monkeypatch, tmp_path):
    configure_bridge(monkeypatch, tmp_path)
    package = {
        "format": "piecs-prompt-package",
        "packageVersion": "1.0.0",
        "exportedAt": "2026-11-03T00:00:00Z",
        "templates": [{"id": "template-1", "api_key": "secret"}],
        "workflows": [],
        "workflowGraphs": [],
    }
    assert client.post("/api/v1/bridge/packages", json=package, headers=AUTH).status_code == 422
    package["templates"] = [{"id": "template-1"}]
    package["packageVersion"] = "9.0.0"
    assert client.post("/api/v1/bridge/packages", json=package, headers=AUTH).status_code == 422


def valid_workflow():
    return {
        "graphId": "graph-1",
        "graph": {
            "schemaVersion": "1.0.0",
            "nodes": [
                {"id": "source-a", "commandId": "image.generate", "parameters": {"prompt": "A"}},
                {"id": "source-b", "commandId": "image.generate", "parameters": {"prompt": "B"}},
                {"id": "join", "commandId": "image.generate", "parameters": {}},
            ],
            "edges": [
                {"id": "edge-a", "from": "source-a", "to": "join"},
                {"id": "edge-b", "from": "source-b", "to": "join"},
            ],
        },
    }


def test_workflow_submission_is_durable_queued_and_idempotent(monkeypatch, tmp_path):
    configure_bridge(monkeypatch, tmp_path)
    first = client.post("/api/v1/bridge/workflows", json=valid_workflow(), headers={**AUTH, "Idempotency-Key": "request-1"})
    second = client.post("/api/v1/bridge/workflows", json=valid_workflow(), headers={**AUTH, "Idempotency-Key": "request-1"})
    assert first.status_code == 202
    assert second.status_code == 202
    assert first.json()["executionId"] == second.json()["executionId"]
    assert first.json()["status"] == "queued"
    status_response = client.get(f"/api/v1/bridge/executions/{first.json()['executionId']}", headers=AUTH)
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "queued"


def test_workflow_submission_rejects_cycles_and_idempotency_conflicts(monkeypatch, tmp_path):
    configure_bridge(monkeypatch, tmp_path)
    cyclic = valid_workflow()
    cyclic["graph"]["nodes"] = cyclic["graph"]["nodes"][:2]
    cyclic["graph"]["edges"] = [
        {"id": "ab", "from": "source-a", "to": "source-b"},
        {"id": "ba", "from": "source-b", "to": "source-a"},
    ]
    assert client.post("/api/v1/bridge/workflows", json=cyclic, headers=AUTH).status_code == 422

    first = client.post("/api/v1/bridge/workflows", json=valid_workflow(), headers={**AUTH, "Idempotency-Key": "same-key"})
    other = valid_workflow()
    other["graphId"] = "different-graph"
    conflict = client.post("/api/v1/bridge/workflows", json=other, headers={**AUTH, "Idempotency-Key": "same-key"})
    assert first.status_code == 202
    assert conflict.status_code == 409


def test_workflow_submission_rejects_secret_fields(monkeypatch, tmp_path):
    configure_bridge(monkeypatch, tmp_path)
    payload = valid_workflow()
    payload["graph"]["nodes"][0]["parameters"]["api_key"] = "do-not-store"
    response = client.post("/api/v1/bridge/workflows", json=payload, headers=AUTH)
    assert response.status_code == 422
