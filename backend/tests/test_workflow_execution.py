import base64
import time
from types import SimpleNamespace

from app.bridge import store, worker_store
from app.bridge import worker as worker_module


def configure(monkeypatch, tmp_path):
    settings = lambda: SimpleNamespace(database_path=str(tmp_path / "execution.sqlite3"))
    monkeypatch.setattr(store, "get_settings", settings)
    monkeypatch.setattr(worker_store, "get_settings", settings)
    store.initialize_bridge_store()
    worker_store.initialize_worker_schema()


class FakeGemini:
    active = 0
    max_active = 0
    calls = []

    def generate_image(self, **kwargs):
        type(self).active += 1
        type(self).max_active = max(type(self).max_active, type(self).active)
        time.sleep(0.02)
        type(self).calls.append(kwargs["prompt"])
        type(self).active -= 1
        return {
            "model": "fake-model",
            "interaction_id": "fake-interaction",
            "image": {"mime_type": "image/png", "data": base64.b64encode(b"fake-image").decode()},
        }


def test_server_executor_runs_branches_concurrently_then_join(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path)
    FakeGemini.active = 0
    FakeGemini.max_active = 0
    FakeGemini.calls = []
    monkeypatch.setattr(worker_module, "GeminiImageAdapter", FakeGemini)
    monkeypatch.setattr(worker_module.asset_store, "put_image", lambda asset_id, data, mime: {
        "id": asset_id, "mimeType": mime, "size": len(data),
    })
    monkeypatch.setattr(worker_module.asset_store, "get_image", lambda asset_id: (b"fake-image", "image/png"))

    graph = {
        "graphId": "graph-branch-join",
        "graph": {
            "schemaVersion": "1.0.0",
            "nodes": [
                {"id": "a", "commandId": "image.generate", "parameters": {"prompt": "A"}},
                {"id": "b", "commandId": "image.generate", "parameters": {"prompt": "B"}},
                {"id": "join", "commandId": "image.edit", "parameters": {"prompt": "JOIN"}},
            ],
            "edges": [
                {"id": "ab", "from": "a", "to": "join"},
                {"id": "bb", "from": "b", "to": "join"},
            ],
        },
    }
    queued = store.submit_execution("graph-branch-join", graph, None)
    claim = worker_store.claim_next_execution("worker-a")
    worker_module.execute_claimed_execution(claim, "worker-a", concurrency=2)

    result = worker_store.get_worker_execution(queued["executionId"])
    assert result["status"] == "succeeded"
    assert result["nodes"]["a"]["status"] == "succeeded"
    assert result["nodes"]["b"]["status"] == "succeeded"
    assert result["nodes"]["join"]["status"] == "succeeded"
    assert FakeGemini.max_active >= 2
    assert FakeGemini.calls.count("JOIN") == 1


def test_server_executor_blocks_downstream_wave_after_failure(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path)

    class FailingGemini:
        def generate_image(self, **kwargs):
            if kwargs["prompt"] == "FAIL":
                raise ValueError("provider test failure")
            return {
                "model": "fake-model",
                "image": {"mime_type": "image/png", "data": base64.b64encode(b"image").decode()},
            }

    monkeypatch.setattr(worker_module, "GeminiImageAdapter", FailingGemini)
    monkeypatch.setattr(worker_module.asset_store, "put_image", lambda asset_id, data, mime: {
        "id": asset_id, "mimeType": mime, "size": len(data),
    })
    graph = {
        "graphId": "graph-fail",
        "graph": {
            "schemaVersion": "1.0.0",
            "nodes": [
                {"id": "a", "commandId": "image.generate", "parameters": {"prompt": "FAIL"}},
                {"id": "join", "commandId": "image.edit", "parameters": {"prompt": "JOIN"}},
            ],
            "edges": [{"id": "edge", "from": "a", "to": "join"}],
        },
    }
    queued = store.submit_execution("graph-fail", graph, None)
    claim = worker_store.claim_next_execution("worker-a")
    worker_module.execute_claimed_execution(claim, "worker-a", concurrency=2)
    result = worker_store.get_worker_execution(queued["executionId"])
    assert result["status"] == "failed"
    assert result["nodes"]["a"]["status"] == "failed"
    assert result["nodes"]["join"]["status"] == "blocked"
