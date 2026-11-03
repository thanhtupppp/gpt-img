"""Durable SQLite queue operations for the standalone workflow worker."""
import json
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from ..config import get_settings


def _connect() -> sqlite3.Connection:
    path = Path(get_settings().database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=30, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 30000")
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat(timespec="seconds")


def initialize_worker_schema() -> None:
    with closing(_connect()) as db:
        columns = {row["name"] for row in db.execute("PRAGMA table_info(bridge_executions)")}
        migrations = {
            "worker_id": "TEXT",
            "lease_expires_at": "TEXT",
            "attempts": "INTEGER NOT NULL DEFAULT 0",
            "node_states": "TEXT NOT NULL DEFAULT '{}'",
            "started_at": "TEXT",
            "finished_at": "TEXT",
            "cancel_requested": "INTEGER NOT NULL DEFAULT 0",
            "error_summary": "TEXT",
        }
        db.execute("BEGIN IMMEDIATE")
        try:
            for name, definition in migrations.items():
                if name not in columns:
                    db.execute(f"ALTER TABLE bridge_executions ADD COLUMN {name} {definition}")
            db.execute("CREATE INDEX IF NOT EXISTS idx_bridge_executions_queue ON bridge_executions(status, created_at)")
            db.execute("CREATE INDEX IF NOT EXISTS idx_bridge_executions_lease ON bridge_executions(status, lease_expires_at)")
            db.execute("COMMIT")
        except Exception:
            db.execute("ROLLBACK")
            raise


def claim_next_execution(worker_id: str, lease_seconds: int = 90) -> dict[str, Any] | None:
    """Atomically claim the oldest queued record. Expired running records are never replayed."""
    initialize_worker_schema()
    now = _now()
    expires = _iso(now + timedelta(seconds=lease_seconds))
    with closing(_connect()) as db:
        db.execute("BEGIN IMMEDIATE")
        try:
            # A lost lease is ambiguous: the provider may already have billed the request.
            stale = db.execute(
                "SELECT id, node_states FROM bridge_executions WHERE status='running' AND lease_expires_at < ?",
                (_iso(now),),
            ).fetchall()
            for row in stale:
                states = json.loads(row["node_states"] or "{}")
                for node in states.values():
                    if node.get("status") == "running":
                        node["status"] = "interrupted"
                db.execute(
                    """UPDATE bridge_executions SET status='interrupted', node_states=?,
                       worker_id=NULL, lease_expires_at=NULL, finished_at=?, updated_at=?,
                       error_summary='Worker lease expired; execution was not replayed.'
                       WHERE id=? AND status='running'""",
                    (json.dumps(states, separators=(",", ":")), _iso(now), _iso(now), row["id"]),
                )
            row = db.execute(
                "SELECT id, graph_id, payload, attempts FROM bridge_executions WHERE status='queued' ORDER BY created_at, id LIMIT 1"
            ).fetchone()
            if row is None:
                db.execute("COMMIT")
                return None
            changed = db.execute(
                """UPDATE bridge_executions SET status='running', worker_id=?, lease_expires_at=?,
                   attempts=attempts+1, started_at=COALESCE(started_at, ?), updated_at=?
                   WHERE id=? AND status='queued'""",
                (worker_id, expires, _iso(now), _iso(now), row["id"]),
            ).rowcount
            if changed != 1:
                db.execute("ROLLBACK")
                return None
            db.execute("COMMIT")
            return {
                "execution_id": row["id"],
                "graph_id": row["graph_id"],
                "payload": json.loads(row["payload"]),
                "attempt": row["attempts"] + 1,
                "worker_id": worker_id,
            }
        except Exception:
            if db.in_transaction:
                db.execute("ROLLBACK")
            raise


def heartbeat(execution_id: str, worker_id: str, lease_seconds: int = 90) -> bool:
    initialize_worker_schema()
    now = _now()
    with closing(_connect()) as db:
        changed = db.execute(
            """UPDATE bridge_executions SET lease_expires_at=?, updated_at=?
               WHERE id=? AND status='running' AND worker_id=?""",
            (_iso(now + timedelta(seconds=lease_seconds)), _iso(now), execution_id, worker_id),
        ).rowcount
    return changed == 1


def cancellation_requested(execution_id: str) -> bool:
    initialize_worker_schema()
    with closing(_connect()) as db:
        row = db.execute("SELECT cancel_requested FROM bridge_executions WHERE id=?", (execution_id,)).fetchone()
    return bool(row and row["cancel_requested"])


def persist_node_states(execution_id: str, worker_id: str, states: dict[str, dict[str, Any]]) -> bool:
    initialize_worker_schema()
    now = _iso(_now())
    with closing(_connect()) as db:
        changed = db.execute(
            """UPDATE bridge_executions SET node_states=?, updated_at=?
               WHERE id=? AND status='running' AND worker_id=?""",
            (json.dumps(states, separators=(",", ":")), now, execution_id, worker_id),
        ).rowcount
    return changed == 1


def finish_execution(
    execution_id: str, worker_id: str, status: str,
    states: dict[str, dict[str, Any]], error_summary: str | None = None,
) -> bool:
    if status not in {"succeeded", "failed", "cancelled", "interrupted"}:
        raise ValueError("Invalid terminal execution status.")
    initialize_worker_schema()
    now = _iso(_now())
    with closing(_connect()) as db:
        changed = db.execute(
            """UPDATE bridge_executions SET status=?, node_states=?, error_summary=?,
               worker_id=NULL, lease_expires_at=NULL, finished_at=?, updated_at=?
               WHERE id=? AND status='running' AND worker_id=?""",
            (status, json.dumps(states, separators=(",", ":")), error_summary, now, now, execution_id, worker_id),
        ).rowcount
    return changed == 1


def request_execution_cancel(execution_id: str) -> bool:
    initialize_worker_schema()
    with closing(_connect()) as db:
        changed = db.execute(
            """UPDATE bridge_executions SET cancel_requested=1, updated_at=?
               WHERE id=? AND status IN ('queued','running')""",
            (_iso(_now()), execution_id),
        ).rowcount
    return changed == 1


def get_worker_execution(execution_id: str) -> dict[str, Any] | None:
    initialize_worker_schema()
    with closing(_connect()) as db:
        row = db.execute(
            """SELECT id, graph_id, status, attempts, node_states, started_at,
               finished_at, error_summary, created_at, updated_at
               FROM bridge_executions WHERE id=?""",
            (execution_id,),
        ).fetchone()
    if row is None:
        return None
    return {
        "executionId": row["id"], "graphId": row["graph_id"], "status": row["status"],
        "attempts": row["attempts"], "nodes": json.loads(row["node_states"] or "{}"),
        "startedAt": row["started_at"], "finishedAt": row["finished_at"],
        "error": row["error_summary"], "createdAt": row["created_at"], "updatedAt": row["updated_at"],
    }
