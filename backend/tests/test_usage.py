from concurrent.futures import ThreadPoolExecutor

import pytest

from app.bridge import store as bridge_store
from app.bridge import worker_store
from app.config import get_settings
from app.tenancy import store as tenancy_store
from app.tenancy import usage


ISSUER = "https://issuer.example.test/"


def configure_database(monkeypatch, tmp_path):
    settings = get_settings()
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "usage.sqlite3"))


def make_workspace(subject="owner"):
    return tenancy_store.create_workspace(ISSUER, subject, "Usage workspace")


def workflow(graph_id="usage-graph", node_count=3):
    return {
        "graphId": graph_id,
        "graph": {
            "schemaVersion": "1.0.0",
            "nodes": [
                {"id": f"node-{index}", "commandId": "image.generate", "parameters": {}}
                for index in range(node_count)
            ],
            "edges": [],
        },
    }


def submit(workspace_id, graph_id, node_count=3, key=None):
    payload = workflow(graph_id, node_count)
    return bridge_store.submit_workspace_execution(
        workspace_id, graph_id, payload, key
    )


def test_workspace_usage_defaults_to_unlimited_and_reserves_node_units(monkeypatch, tmp_path):
    configure_database(monkeypatch, tmp_path)
    workspace = make_workspace()

    before = usage.get_workspace_usage(workspace["id"])
    assert before["monthlyQuotaUnits"] is None
    assert before["availableUnits"] is None
    assert before["quotaEnforced"] is False

    execution = submit(workspace["id"], "graph-a", 3)
    after = usage.get_workspace_usage(workspace["id"])
    assert execution["status"] == "queued"
    assert after["usedUnits"] == 0
    assert after["reservedUnits"] == 3


def test_quota_blocks_oversubmission_and_idempotency_does_not_double_reserve(monkeypatch, tmp_path):
    configure_database(monkeypatch, tmp_path)
    workspace = make_workspace()
    usage.set_workspace_quota(workspace["id"], 4)

    first = submit(workspace["id"], "graph-a", 3, "request-a")
    repeated = submit(workspace["id"], "graph-a", 3, "request-a")
    assert first["executionId"] == repeated["executionId"]
    assert usage.get_workspace_usage(workspace["id"])["reservedUnits"] == 3

    with pytest.raises(usage.QuotaExceededError):
        submit(workspace["id"], "graph-b", 2, "request-b")

    snapshot = usage.get_workspace_usage(workspace["id"])
    assert snapshot["usedUnits"] == 0
    assert snapshot["reservedUnits"] == 3
    assert snapshot["monthlyQuotaUnits"] == 4


def test_worker_settlement_moves_started_nodes_from_reserved_to_used(monkeypatch, tmp_path):
    configure_database(monkeypatch, tmp_path)
    workspace = make_workspace()
    execution = submit(workspace["id"], "graph-a", 3)

    claim = worker_store.claim_next_execution("test-worker")
    assert claim["execution_id"] == execution["executionId"]
    states = {
        "node-0": {"status": "succeeded", "startedAt": "2026-11-03T00:00:00+00:00"},
        "node-1": {"status": "failed", "startedAt": "2026-11-03T00:00:01+00:00"},
        "node-2": {"status": "blocked"},
    }
    assert worker_store.finish_execution(
        execution["executionId"], "test-worker", "failed", states, "provider failure"
    )

    snapshot = usage.get_workspace_usage(workspace["id"])
    assert snapshot["usedUnits"] == 2
    assert snapshot["reservedUnits"] == 0


def test_queued_cancellation_releases_entire_reservation(monkeypatch, tmp_path):
    configure_database(monkeypatch, tmp_path)
    workspace = make_workspace()
    execution = submit(workspace["id"], "graph-a", 2)

    assert worker_store.request_execution_cancel(
        execution["executionId"], workspace["id"]
    )
    snapshot = usage.get_workspace_usage(workspace["id"])
    assert snapshot["usedUnits"] == 0
    assert snapshot["reservedUnits"] == 0


def test_concurrent_submissions_cannot_overspend_workspace_quota(monkeypatch, tmp_path):
    configure_database(monkeypatch, tmp_path)
    workspace = make_workspace()
    usage.set_workspace_quota(workspace["id"], 3)
    usage.initialize_usage_schema()

    def attempt(index):
        try:
            submit(workspace["id"], f"graph-{index}", 2)
            return "accepted"
        except usage.QuotaExceededError:
            return "quota_exceeded"

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, [1, 2]))

    assert sorted(results) == ["accepted", "quota_exceeded"]
    snapshot = usage.get_workspace_usage(workspace["id"])
    assert snapshot["reservedUnits"] == 2
    assert snapshot["usedUnits"] == 0
