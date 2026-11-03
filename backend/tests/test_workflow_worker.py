from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.bridge import store, worker_store


def configure(monkeypatch, tmp_path):
    settings = lambda: SimpleNamespace(database_path=str(tmp_path / "worker.sqlite3"))
    monkeypatch.setattr(store, "get_settings", settings)
    monkeypatch.setattr(worker_store, "get_settings", settings)
    store.initialize_bridge_store()
    worker_store.initialize_worker_schema()


def payload():
    return {
        "graphId": "g1",
        "graph": {
            "schemaVersion": "1.0.0",
            "nodes": [{"id": "n1", "commandId": "image.generate", "parameters": {"prompt": "test"}}],
            "edges": [],
        },
    }


def test_claim_is_atomic_and_only_one_worker_gets_execution(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path)
    execution = store.submit_execution("g1", payload(), None)
    first = worker_store.claim_next_execution("worker-a")
    second = worker_store.claim_next_execution("worker-b")
    assert first["execution_id"] == execution["executionId"]
    assert second is None


def test_worker_heartbeat_and_terminal_state(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path)
    execution = store.submit_execution("g1", payload(), None)
    claim = worker_store.claim_next_execution("worker-a")
    assert worker_store.heartbeat(execution["executionId"], "worker-a")
    states = {"n1": {"status": "succeeded", "assetId": "asset-1"}}
    assert worker_store.finish_execution(execution["executionId"], "worker-a", "succeeded", states)
    result = worker_store.get_worker_execution(execution["executionId"])
    assert result["status"] == "succeeded"
    assert result["nodes"]["n1"]["assetId"] == "asset-1"
    assert not worker_store.finish_execution(execution["executionId"], "worker-a", "failed", {})


def test_expired_lease_is_interrupted_and_never_replayed(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path)
    execution = store.submit_execution("g1", payload(), None)
    worker_store.claim_next_execution("worker-a")
    with worker_store._connect() as db:
        old = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        db.execute("UPDATE bridge_executions SET lease_expires_at=? WHERE id=?", (old, execution["executionId"]))
    next_claim = worker_store.claim_next_execution("worker-b")
    assert next_claim is None
    result = worker_store.get_worker_execution(execution["executionId"])
    assert result["status"] == "interrupted"
    assert "not replayed" in result["error"]


def test_queued_execution_can_be_cancelled_without_claim(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path)
    execution = store.submit_execution("g1", payload(), None)
    assert worker_store.request_execution_cancel(execution["executionId"])
    assert worker_store.get_worker_execution(execution["executionId"])["status"] == "cancelled"
    assert worker_store.claim_next_execution("worker-a") is None


def test_worker_availability_requires_recent_heartbeat(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path)
    assert not worker_store.worker_available()
    worker_store.register_worker("worker-a")
    assert worker_store.worker_available()
