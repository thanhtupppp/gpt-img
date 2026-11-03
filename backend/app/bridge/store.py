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
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)


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
            "SELECT id, format, package_version, payload, created_at FROM bridge_packages WHERE id = ?",
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
            "SELECT id, graph_id, status, created_at, updated_at FROM bridge_executions WHERE id = ?",
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
