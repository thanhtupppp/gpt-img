"""Persistent rate limiting and privacy-safe audit event storage."""
import hashlib
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from .config import get_settings


def _connect() -> sqlite3.Connection:
    path = Path(get_settings().database_path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=15, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA busy_timeout = 15000")
    return db


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat(timespec="seconds")


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def initialize_security_controls() -> None:
    with closing(_connect()) as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS rate_limit_buckets (
            bucket_key TEXT PRIMARY KEY,
            window_start INTEGER NOT NULL,
            request_count INTEGER NOT NULL CHECK(request_count >= 0),
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_rate_limit_updated
            ON rate_limit_buckets(updated_at);
        CREATE TABLE IF NOT EXISTS audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id TEXT NOT NULL,
            occurred_at TEXT NOT NULL,
            actor_type TEXT NOT NULL,
            actor_hash TEXT,
            workspace_id TEXT,
            action TEXT NOT NULL,
            route TEXT NOT NULL,
            http_method TEXT NOT NULL,
            status_code INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_occurred
            ON audit_events(occurred_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_workspace
            ON audit_events(workspace_id, occurred_at DESC);
        """)


def enforce_rate_limit(identity: str, *, category: str = "api") -> None:
    """Atomically consume one fixed-window request for a validated identity."""
    settings = get_settings()
    limit = int(getattr(settings, "rate_limit_requests", 120))
    window_seconds = int(getattr(settings, "rate_limit_window_seconds", 60))
    if limit < 1 or window_seconds < 1:
        raise HTTPException(
            status_code=503,
            detail={"code": "RATE_LIMIT_MISCONFIGURED", "message": "Rate limiting is not configured safely."},
        )
    initialize_security_controls()
    now = _now()
    window_start = int(now.timestamp()) // window_seconds * window_seconds
    reset_at = window_start + window_seconds
    key = _digest(f"{category}:{identity}")
    with closing(_connect()) as db:
        db.execute("BEGIN IMMEDIATE")
        try:
            row = db.execute(
                "SELECT window_start, request_count FROM rate_limit_buckets WHERE bucket_key=?",
                (key,),
            ).fetchone()
            count = row["request_count"] if row and row["window_start"] == window_start else 0
            if count >= limit:
                db.execute("COMMIT")
                retry_after = max(1, reset_at - int(now.timestamp()))
                raise HTTPException(
                    status_code=429,
                    detail={
                        "code": "RATE_LIMIT_EXCEEDED",
                        "message": "Too many requests. Please retry after the current rate-limit window.",
                        "retryAfterSeconds": retry_after,
                    },
                    headers={"Retry-After": str(retry_after)},
                )
            db.execute(
                """INSERT INTO rate_limit_buckets(bucket_key,window_start,request_count,updated_at)
                   VALUES(?,?,1,?)
                   ON CONFLICT(bucket_key) DO UPDATE SET
                     window_start=excluded.window_start,
                     request_count=CASE
                       WHEN rate_limit_buckets.window_start=excluded.window_start
                       THEN rate_limit_buckets.request_count+1 ELSE 1 END,
                     updated_at=excluded.updated_at""",
                (key, window_start, _iso(now)),
            )
            # Bound stale bucket growth without adding a separate maintenance job.
            if int(now.timestamp()) % 300 < 2:
                cutoff = _iso(now - timedelta(days=2))
                db.execute("DELETE FROM rate_limit_buckets WHERE updated_at < ?", (cutoff,))
            db.execute("COMMIT")
        except HTTPException:
            raise
        except Exception:
            if db.in_transaction:
                db.execute("ROLLBACK")
            raise


def record_audit_event(
    *,
    request_id: str,
    actor_type: str,
    actor_identity: str | None,
    workspace_id: str | None,
    action: str,
    route: str,
    method: str,
    status_code: int,
    duration_ms: int,
) -> None:
    initialize_security_controls()
    actor_hash = _digest(actor_identity) if actor_identity else None
    with closing(_connect()) as db:
        db.execute(
            """INSERT INTO audit_events(
                request_id,occurred_at,actor_type,actor_hash,workspace_id,
                action,route,http_method,status_code,duration_ms
            ) VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (
                request_id, _iso(_now()), actor_type, actor_hash, workspace_id,
                action, route[:256], method[:12], status_code,
                max(0, min(duration_ms, 2_147_483_647)),
            ),
        )


def list_audit_events(
    *, limit: int = 100, offset: int = 0, workspace_id: str | None = None
) -> dict[str, Any]:
    initialize_security_controls()
    where = " WHERE workspace_id=?" if workspace_id else ""
    params: tuple[Any, ...] = (workspace_id,) if workspace_id else ()
    with closing(_connect()) as db:
        total = db.execute(f"SELECT COUNT(*) AS total FROM audit_events{where}", params).fetchone()["total"]
        rows = db.execute(
            f"""SELECT id,request_id,occurred_at,actor_type,actor_hash,workspace_id,
                       action,route,http_method,status_code,duration_ms
                FROM audit_events{where}
                ORDER BY occurred_at DESC,id DESC LIMIT ? OFFSET ?""",
            (*params, limit, offset),
        ).fetchall()
    return {
        "items": [
            {
                "id": row["id"],
                "requestId": row["request_id"],
                "occurredAt": row["occurred_at"],
                "actorType": row["actor_type"],
                "actorHash": row["actor_hash"],
                "workspaceId": row["workspace_id"],
                "action": row["action"],
                "route": row["route"],
                "method": row["http_method"],
                "statusCode": row["status_code"],
                "durationMs": row["duration_ms"],
            }
            for row in rows
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


from .providers.security import require_admin

router = APIRouter(prefix="/api/v1/admin/audit-logs", tags=["audit"], dependencies=[Depends(require_admin)])


@router.get("")
def get_audit_events(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=1_000_000),
    workspace_id: str | None = Query(default=None, min_length=1, max_length=64),
):
    return list_audit_events(limit=limit, offset=offset, workspace_id=workspace_id)


async def audit_request_middleware(request: Request, call_next):
    import time
    from uuid import uuid4

    started = time.monotonic()
    response = await call_next(request)
    path = request.url.path
    if request.method == "OPTIONS" or path in {"/healthz", "/api/v1/healthz"}:
        return response
    route = getattr(request.scope.get("route"), "path", path)
    actor_type = getattr(request.state, "audit_actor_type", "anonymous")
    actor_identity = getattr(request.state, "audit_actor_identity", None)
    workspace_id = request.path_params.get("workspace_id")
    action = "read" if request.method in {"GET", "HEAD"} else "write"
    try:
        record_audit_event(
            request_id=getattr(request.state, "request_id", str(uuid4())),
            actor_type=actor_type,
            actor_identity=actor_identity,
            workspace_id=str(workspace_id) if workspace_id else None,
            action=action,
            route=route,
            method=request.method,
            status_code=response.status_code,
            duration_ms=int((time.monotonic() - started) * 1000),
        )
    except Exception:
        # Audit storage failure must not turn a completed business request into
        # a 500 or leak database details. Operational monitoring should alert.
        pass
    return response
