import json
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any
from uuid import uuid4

from ..config import get_settings


def _connect() -> sqlite3.Connection:
    database_path = Path(get_settings().database_path)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_bridge_store() -> None:
    with closing(_connect()) as connection, connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS bridge_packages (
                id TEXT PRIMARY KEY,
                format TEXT NOT NULL,
                package_version TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                workspace_id TEXT
            )
        """)
        connection.execute("""
            CREATE TABLE IF NOT EXISTS bridge_executions (
                id TEXT PRIMARY KEY,
                graph_id TEXT NOT NULL,
                status TEXT NOT NULL,
                payload TEXT NOT NULL,
                idempotency_key TEXT UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                workspace_id TEXT
            )
        """)
        package_columns = {row[1] for row in connection.execute("PRAGMA table_info(bridge_packages)")}
        execution_columns = {row[1] for row in connection.execute("PRAGMA table_info(bridge_executions)")}
        if "workspace_id" not in package_columns:
            connection.execute("ALTER TABLE bridge_packages ADD COLUMN workspace_id TEXT")
        if "workspace_id" not in execution_columns:
            connection.execute("ALTER TABLE bridge_executions ADD COLUMN workspace_id TEXT")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_bridge_packages_workspace ON bridge_packages(workspace_id, created_at)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_bridge_executions_workspace ON bridge_executions(workspace_id, created_at)")


def save_package(payload: dict[str, Any]) -> dict[str, Any]:
    initialize_bridge_store()
    package_id = str(uuid4())
    serialized = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    with closing(_connect()) as connection, connection:
        connection.execute(
            "INSERT INTO bridge_packages (id, format, package_version, payload) VALUES (?, ?, ?, ?)",
            (package_id, payload["format"], payload["packageVersion"], serialized),
        )
    return {"id": package_id, "format": payload["format"], "packageVersion": payload["packageVersion"]}


def get_package(package_id: str) -> dict[str, Any] | None:
    initialize_bridge_store()
    with closing(_connect()) as connection:
        row = connection.execute(
            "SELECT id, format, package_version, payload, created_at FROM bridge_packages WHERE id = ? AND workspace_id IS NULL",
            (package_id,),
        ).fetchone()
    if row is None:
        return None
    return {
        "id": row["id"],
        "format": row["format"],
        "packageVersion": row["package_version"],
        "createdAt": row["created_at"],
        "package": json.loads(row["payload"]),
    }


def submit_execution(graph_id: str, payload: dict[str, Any], idempotency_key: str | None) -> dict[str, Any]:
    initialize_bridge_store()
    serialized = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    with closing(_connect()) as connection, connection:
        if idempotency_key:
            existing = connection.execute(
                "SELECT id, graph_id, status, created_at, updated_at FROM bridge_executions WHERE idempotency_key = ?",
                (idempotency_key,),
            ).fetchone()
            if existing is not None:
                if existing["graph_id"] != graph_id:
                    raise ValueError("Idempotency key was already used for a different graph.")
                return _execution_row(existing)
        execution_id = str(uuid4())
        connection.execute(
            """INSERT INTO bridge_executions (id, graph_id, status, payload, idempotency_key)
               VALUES (?, ?, 'queued', ?, ?)""",
            (execution_id, graph_id, serialized, idempotency_key),
        )
        row = connection.execute(
            "SELECT id, graph_id, status, created_at, updated_at FROM bridge_executions WHERE id = ? AND workspace_id IS NULL",
            (execution_id,),
        ).fetchone()
    return _execution_row(row)


def get_execution(execution_id: str) -> dict[str, Any] | None:
    initialize_bridge_store()
    with closing(_connect()) as connection:
        row = connection.execute(
            "SELECT id, graph_id, status, created_at, updated_at FROM bridge_executions WHERE id = ?",
            (execution_id,),
        ).fetchone()
    return _execution_row(row) if row else None


def _execution_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "executionId": row["id"],
        "graphId": row["graph_id"],
        "status": row["status"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def save_workspace_package(workspace_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    initialize_bridge_store()
    package_id = str(uuid4())
    serialized = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    with closing(_connect()) as connection, connection:
        connection.execute(
            "INSERT INTO bridge_packages (id, format, package_version, payload, workspace_id) VALUES (?, ?, ?, ?, ?)",
            (package_id, payload["format"], payload["packageVersion"], serialized, workspace_id),
        )
    return {"id": package_id, "format": payload["format"], "packageVersion": payload["packageVersion"]}


def get_workspace_package(workspace_id: str, package_id: str) -> dict[str, Any] | None:
    initialize_bridge_store()
    with closing(_connect()) as connection:
        row = connection.execute(
            "SELECT id, format, package_version, payload, created_at FROM bridge_packages WHERE id=? AND workspace_id=?",
            (package_id, workspace_id),
        ).fetchone()
    if row is None:
        return None
    return {"id": row["id"], "format": row["format"], "packageVersion": row["package_version"],
            "createdAt": row["created_at"], "package": json.loads(row["payload"])}


def submit_workspace_execution(workspace_id: str, graph_id: str, payload: dict[str, Any],
                               idempotency_key: str | None) -> dict[str, Any]:
    # Initialize all required tables before opening the submission transaction.
    from ..tenancy.usage import initialize_usage_schema, reserve_usage_in_transaction

    initialize_usage_schema()
    nodes = payload.get("graph", {}).get("nodes", [])
    if not isinstance(nodes, list) or not nodes:
        raise ValueError("Workflow graph must contain at least one node.")
    serialized = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    scoped_key = f"{workspace_id}:{idempotency_key}" if idempotency_key else None
    with closing(_connect()) as connection:
        connection.execute("BEGIN IMMEDIATE")
        try:
            if scoped_key:
                existing = connection.execute(
                    "SELECT id, graph_id, status, created_at, updated_at FROM bridge_executions WHERE idempotency_key=? AND workspace_id=?",
                    (scoped_key, workspace_id),
                ).fetchone()
                if existing:
                    if existing["graph_id"] != graph_id:
                        raise ValueError("Idempotency key was already used for a different graph.")
                    connection.commit()
                    return _execution_row(existing)

            execution_id = str(uuid4())
            connection.execute(
                "INSERT INTO bridge_executions (id,graph_id,status,payload,idempotency_key,workspace_id) VALUES (?,?,'queued',?,?,?)",
                (execution_id, graph_id, serialized, scoped_key, workspace_id),
            )
            reserve_usage_in_transaction(connection, execution_id, workspace_id, len(nodes))
            row = connection.execute(
                "SELECT id,graph_id,status,created_at,updated_at FROM bridge_executions WHERE id=? AND workspace_id=?",
                (execution_id, workspace_id),
            ).fetchone()
            connection.commit()
            return _execution_row(row)
        except Exception:
            connection.rollback()
            raise


def get_workspace_execution(workspace_id: str, execution_id: str) -> dict[str, Any] | None:
    initialize_bridge_store()
    with closing(_connect()) as connection:
        row = connection.execute(
            "SELECT id,graph_id,status,created_at,updated_at FROM bridge_executions WHERE id=? AND workspace_id=?",
            (execution_id, workspace_id),
        ).fetchone()
    return _execution_row(row) if row else None
