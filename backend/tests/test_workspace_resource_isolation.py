from app.bridge import store, worker_store


def test_workspace_packages_and_executions_are_isolated(monkeypatch, tmp_path):
    from app.config import get_settings
    settings = get_settings()
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "bridge.sqlite3"))

    workspace_a = "workspace-a"
    workspace_b = "workspace-b"
    package = {
        "format": "piecs-prompt-package",
        "packageVersion": "1.0.0",
        "templates": [{"id": "template-a"}],
        "workflows": [],
        "workflowGraphs": [],
    }
    saved = store.save_workspace_package(workspace_a, package)
    assert store.get_workspace_package(workspace_a, saved["id"])["package"] == package
    assert store.get_workspace_package(workspace_b, saved["id"]) is None

    graph = {"graphId": "graph-a", "graph": {"schemaVersion": "1.0.0", "nodes": [{"id": "n1"}], "edges": []}}
    execution = store.submit_workspace_execution(workspace_a, "graph-a", graph, "request-1")
    assert store.get_workspace_execution(workspace_a, execution["executionId"]) is not None
    assert store.get_workspace_execution(workspace_b, execution["executionId"]) is None
    assert store.submit_workspace_execution(workspace_a, "graph-a", graph, "request-1")["executionId"] == execution["executionId"]


def test_worker_claim_preserves_workspace_id(monkeypatch, tmp_path):
    from app.config import get_settings
    settings = get_settings()
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "worker.sqlite3"))

    store.submit_workspace_execution(
        "workspace-a", "graph-a",
        {"graphId": "graph-a", "graph": {"schemaVersion": "1.0.0", "nodes": [{"id": "n1"}], "edges": []}},
        None,
    )
    claim = worker_store.claim_next_execution("worker-test")
    assert claim is not None
    assert claim["workspace_id"] == "workspace-a"
