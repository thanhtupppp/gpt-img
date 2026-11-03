"""Workspace identity, membership and role enforcement.

User identity is keyed by the validated OIDC issuer + subject pair. Workspace
membership is always resolved server-side; client-supplied role claims are ignored.
"""
import os
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any
from uuid import uuid4

from ..config import get_settings

ROLES = {"owner", "admin", "member", "viewer"}
ROLE_LEVEL = {"viewer": 0, "member": 1, "admin": 2, "owner": 3}


def _connect() -> sqlite3.Connection:
    path = Path(get_settings().database_path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return db


def initialize_tenancy() -> None:
    with closing(_connect()) as db, db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS tenant_users (
            id TEXT PRIMARY KEY,
            issuer TEXT NOT NULL,
            subject TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(issuer, subject)
        );
        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_by TEXT NOT NULL REFERENCES tenant_users(id),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS workspace_memberships (
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES tenant_users(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK(role IN ('owner','admin','member','viewer')),
            status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(workspace_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user
            ON workspace_memberships(user_id, status);
        """)


def _user_id(db: sqlite3.Connection, issuer: str, subject: str) -> str:
    row = db.execute("SELECT id FROM tenant_users WHERE issuer=? AND subject=?", (issuer, subject)).fetchone()
    if row:
        return row["id"]
    user_id = str(uuid4())
    db.execute("INSERT INTO tenant_users(id,issuer,subject) VALUES(?,?,?)", (user_id, issuer, subject))
    return user_id


def create_workspace(issuer: str, subject: str, name: str) -> dict[str, Any]:
    initialize_tenancy()
    with closing(_connect()) as db:
        db.execute("BEGIN IMMEDIATE")
        try:
            user_id = _user_id(db, issuer, subject)
            workspace_id = str(uuid4())
            db.execute("INSERT INTO workspaces(id,name,created_by) VALUES(?,?,?)", (workspace_id, name, user_id))
            db.execute(
                "INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES(?,?,'owner')",
                (workspace_id, user_id),
            )
            db.commit()
        except Exception:
            db.rollback()
            raise
    return {"id": workspace_id, "name": name, "role": "owner"}


def list_workspaces(issuer: str, subject: str) -> list[dict[str, Any]]:
    initialize_tenancy()
    with closing(_connect()) as db:
        user = db.execute("SELECT id FROM tenant_users WHERE issuer=? AND subject=?", (issuer, subject)).fetchone()
        if not user:
            return []
        rows = db.execute("""
            SELECT w.id,w.name,m.role,m.created_at
            FROM workspaces w JOIN workspace_memberships m ON m.workspace_id=w.id
            WHERE m.user_id=? AND m.status='active' ORDER BY w.created_at,w.id
        """, (user["id"],)).fetchall()
    return [{"id": r["id"], "name": r["name"], "role": r["role"], "joinedAt": r["created_at"]} for r in rows]


def get_membership(issuer: str, subject: str, workspace_id: str) -> dict[str, Any] | None:
    initialize_tenancy()
    with closing(_connect()) as db:
        row = db.execute("""
            SELECT u.id AS user_id,m.role,m.status
            FROM tenant_users u JOIN workspace_memberships m ON m.user_id=u.id
            WHERE u.issuer=? AND u.subject=? AND m.workspace_id=?
        """, (issuer, subject, workspace_id)).fetchone()
    return dict(row) if row else None


def require_role(issuer: str, subject: str, workspace_id: str, minimum_role: str) -> dict[str, Any]:
    if minimum_role not in ROLE_LEVEL:
        raise ValueError("Unknown minimum workspace role.")
    membership = get_membership(issuer, subject, workspace_id)
    if not membership or membership["status"] != "active":
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail={"code":"WORKSPACE_NOT_FOUND","message":"Workspace was not found."})
    if ROLE_LEVEL[membership["role"]] < ROLE_LEVEL[minimum_role]:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail={"code":"WORKSPACE_FORBIDDEN","message":"Your workspace role does not allow this action."})
    return membership


def list_members(issuer: str, subject: str, workspace_id: str) -> list[dict[str, Any]]:
    require_role(issuer, subject, workspace_id, "viewer")
    with closing(_connect()) as db:
        rows = db.execute("""
            SELECT u.issuer,u.subject,m.role,m.status,m.created_at
            FROM workspace_memberships m JOIN tenant_users u ON u.id=m.user_id
            WHERE m.workspace_id=? ORDER BY m.created_at,u.subject
        """, (workspace_id,)).fetchall()
    return [{"issuer":r["issuer"],"subject":r["subject"],"role":r["role"],"status":r["status"],"joinedAt":r["created_at"]} for r in rows]


def add_member(actor_issuer: str, actor_subject: str, workspace_id: str,
               member_issuer: str, member_subject: str, role: str) -> None:
    if role not in {"admin", "member", "viewer"}:
        raise ValueError("New members must be assigned admin, member, or viewer; ownership is not assignable.")
    require_role(actor_issuer, actor_subject, workspace_id, "admin")
    initialize_tenancy()
    with closing(_connect()) as db, db:
        user_id = _user_id(db, member_issuer, member_subject)
        db.execute("""
            INSERT INTO workspace_memberships(workspace_id,user_id,role,status)
            VALUES(?,?,?,'active')
            ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=excluded.role,status='active'
        """, (workspace_id, user_id, role))


def change_member_role(actor_issuer: str, actor_subject: str, workspace_id: str,
                       member_issuer: str, member_subject: str, role: str) -> None:
    if role not in {"admin", "member", "viewer"}:
        raise ValueError("Invalid member role.")
    require_role(actor_issuer, actor_subject, workspace_id, "owner")
    with closing(_connect()) as db, db:
        target = db.execute("""
            SELECT u.id,m.role FROM tenant_users u JOIN workspace_memberships m ON m.user_id=u.id
            WHERE u.issuer=? AND u.subject=? AND m.workspace_id=?
        """, (member_issuer, member_subject, workspace_id)).fetchone()
        if not target:
            raise LookupError("Member not found.")
        if target["role"] == "owner":
            raise ValueError("Workspace ownership cannot be changed through member role management.")
        db.execute("UPDATE workspace_memberships SET role=? WHERE workspace_id=? AND user_id=?",
                   (role, workspace_id, target["id"]))


def remove_member(actor_issuer: str, actor_subject: str, workspace_id: str,
                  member_issuer: str, member_subject: str) -> None:
    require_role(actor_issuer, actor_subject, workspace_id, "owner")
    with closing(_connect()) as db, db:
        target = db.execute("""
            SELECT u.id,m.role FROM tenant_users u JOIN workspace_memberships m ON m.user_id=u.id
            WHERE u.issuer=? AND u.subject=? AND m.workspace_id=?
        """, (member_issuer, member_subject, workspace_id)).fetchone()
        if not target:
            raise LookupError("Member not found.")
        if target["role"] == "owner":
            raise ValueError("The workspace owner cannot be removed.")
        db.execute("DELETE FROM workspace_memberships WHERE workspace_id=? AND user_id=?",
                   (workspace_id, target["id"]))
