"""Workspace-scoped workflow usage metering and quota primitives.

Usage is measured in workflow-node execution units. No prompts, images, provider
responses, credentials, or billing/payment data are stored by this module.
"""
from contextlib import closing
from datetime import datetime, timezone
from typing import Any

from ..bridge.store import _connect, initialize_bridge_store
from .store import initialize_tenancy


class QuotaExceededError(Exception):
    def __init__(self, used: int, reserved: int, requested: int, quota: int):
        super().__init__("Workspace monthly workflow quota would be exceeded.")
        self.used = used
        self.reserved = reserved
        self.requested = requested
        self.quota = quota


def current_usage_period() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def initialize_usage_schema() -> None:
    initialize_bridge_store()
    initialize_tenancy()
    with closing(_connect()) as db, db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS workspace_quotas (
            workspace_id TEXT PRIMARY KEY,
            monthly_units INTEGER CHECK(monthly_units IS NULL OR monthly_units >= 0),
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS workspace_usage_periods (
            workspace_id TEXT NOT NULL,
            period TEXT NOT NULL,
            used_units INTEGER NOT NULL DEFAULT 0 CHECK(used_units >= 0),
            reserved_units INTEGER NOT NULL DEFAULT 0 CHECK(reserved_units >= 0),
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(workspace_id, period)
        );
        CREATE TABLE IF NOT EXISTS workspace_usage_reservations (
            execution_id TEXT PRIMARY KEY REFERENCES bridge_executions(id) ON DELETE CASCADE,
            workspace_id TEXT NOT NULL,
            period TEXT NOT NULL,
            reserved_units INTEGER NOT NULL CHECK(reserved_units >= 0),
            settled_units INTEGER,
            status TEXT NOT NULL CHECK(status IN ('reserved','settled','released','uncertain')),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_workspace_usage_periods_period
            ON workspace_usage_periods(period, workspace_id);
        CREATE INDEX IF NOT EXISTS idx_workspace_usage_reservations_workspace
            ON workspace_usage_reservations(workspace_id, period, status);
        """)


def _ensure_period(db, workspace_id: str, period: str) -> None:
    db.execute(
        """INSERT INTO workspace_usage_periods(workspace_id, period)
           VALUES (?, ?) ON CONFLICT(workspace_id, period) DO NOTHING""",
        (workspace_id, period),
    )


def reserve_usage_in_transaction(
    db, execution_id: str, workspace_id: str, reserved_units: int, period: str | None = None
) -> None:
    if reserved_units < 1:
        raise ValueError("A workflow reservation must contain at least one unit.")
    period = period or current_usage_period()
    _ensure_period(db, workspace_id, period)
    quota_row = db.execute(
        "SELECT monthly_units FROM workspace_quotas WHERE workspace_id=?",
        (workspace_id,),
    ).fetchone()
    quota = quota_row["monthly_units"] if quota_row else None
    totals = db.execute(
        "SELECT used_units, reserved_units FROM workspace_usage_periods WHERE workspace_id=? AND period=?",
        (workspace_id, period),
    ).fetchone()
    used, reserved = totals["used_units"], totals["reserved_units"]
    if quota is not None and used + reserved + reserved_units > quota:
        raise QuotaExceededError(used, reserved, reserved_units, quota)
    db.execute(
        """INSERT INTO workspace_usage_reservations
           (execution_id, workspace_id, period, reserved_units, status)
           VALUES (?, ?, ?, ?, 'reserved')""",
        (execution_id, workspace_id, period, reserved_units),
    )
    db.execute(
        """UPDATE workspace_usage_periods
           SET reserved_units=reserved_units+?, updated_at=CURRENT_TIMESTAMP
           WHERE workspace_id=? AND period=?""",
        (reserved_units, workspace_id, period),
    )


def settle_usage_in_transaction(
    db, execution_id: str, settled_units: int, *, uncertain: bool = False
) -> bool:
    """Settle a reservation once. Repeated calls are harmless."""
    row = db.execute(
        """SELECT workspace_id, period, reserved_units, status
           FROM workspace_usage_reservations WHERE execution_id=?""",
        (execution_id,),
    ).fetchone()
    if row is None or row["status"] != "reserved":
        return False
    reserved = row["reserved_units"]
    settled = min(max(int(settled_units), 0), reserved)
    db.execute(
        """UPDATE workspace_usage_periods
           SET reserved_units=MAX(0, reserved_units-?),
               used_units=used_units+?, updated_at=CURRENT_TIMESTAMP
           WHERE workspace_id=? AND period=?""",
        (reserved, settled, row["workspace_id"], row["period"]),
    )
    status = "uncertain" if uncertain else ("released" if settled == 0 else "settled")
    db.execute(
        """UPDATE workspace_usage_reservations
           SET settled_units=?, status=?, updated_at=CURRENT_TIMESTAMP
           WHERE execution_id=? AND status='reserved'""",
        (settled, status, execution_id),
    )
    return True


def settle_usage(execution_id: str, settled_units: int, *, uncertain: bool = False) -> bool:
    initialize_usage_schema()
    with closing(_connect()) as db:
        db.execute("BEGIN IMMEDIATE")
        try:
            changed = settle_usage_in_transaction(db, execution_id, settled_units, uncertain=uncertain)
            db.commit()
            return changed
        except Exception:
            db.rollback()
            raise


def _summary(db, workspace_id: str, period: str) -> dict[str, Any]:
    quota_row = db.execute(
        "SELECT monthly_units FROM workspace_quotas WHERE workspace_id=?",
        (workspace_id,),
    ).fetchone()
    usage_row = db.execute(
        """SELECT used_units, reserved_units FROM workspace_usage_periods
           WHERE workspace_id=? AND period=?""",
        (workspace_id, period),
    ).fetchone()
    quota = quota_row["monthly_units"] if quota_row else None
    used = usage_row["used_units"] if usage_row else 0
    reserved = usage_row["reserved_units"] if usage_row else 0
    return {
        "period": period,
        "unit": "workflow_node",
        "usedUnits": used,
        "reservedUnits": reserved,
        "monthlyQuotaUnits": quota,
        "availableUnits": None if quota is None else max(0, quota - used - reserved),
        "quotaEnforced": quota is not None,
    }


def get_workspace_usage(workspace_id: str, period: str | None = None) -> dict[str, Any]:
    initialize_usage_schema()
    selected_period = period or current_usage_period()
    with closing(_connect()) as db:
        return _summary(db, workspace_id, selected_period)


def set_workspace_quota(workspace_id: str, monthly_units: int | None) -> dict[str, Any]:
    if monthly_units is not None and monthly_units < 0:
        raise ValueError("Monthly quota must be zero or greater, or null for unlimited.")
    initialize_usage_schema()
    with closing(_connect()) as db, db:
        db.execute(
            """INSERT INTO workspace_quotas(workspace_id, monthly_units, updated_at)
               VALUES (?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(workspace_id) DO UPDATE SET
                 monthly_units=excluded.monthly_units, updated_at=CURRENT_TIMESTAMP""",
            (workspace_id, monthly_units),
        )
    return get_workspace_usage(workspace_id)


def reserve_usage(workspace_id: str, execution_id: str, reserved_units: int) -> None:
    initialize_usage_schema()
    with closing(_connect()) as db:
        db.execute("BEGIN IMMEDIATE")
        try:
            reserve_usage_in_transaction(db, execution_id, workspace_id, reserved_units)
            db.commit()
        except Exception:
            db.rollback()
            raise
