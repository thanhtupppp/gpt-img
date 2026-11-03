import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from cryptography.fernet import Fernet, InvalidToken

from ..config import get_settings


class VaultNotConfiguredError(RuntimeError):
    pass


class VaultIntegrityError(RuntimeError):
    pass


def _cipher() -> Fernet:
    key = get_settings().secret_encryption_key
    if not key:
        raise VaultNotConfiguredError("Secret encryption is not configured.")
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise VaultNotConfiguredError("Secret encryption key must be a valid Fernet key.") from exc


@contextmanager
def _database() -> Iterator[sqlite3.Connection]:
    path = Path(get_settings().database_path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10)
    try:
        os.chmod(path, 0o600)
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS provider_credentials (
                provider_id TEXT PRIMARY KEY,
                encrypted_api_key BLOB NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def credential_exists(provider_id: str) -> bool:
    with _database() as connection:
        row = connection.execute(
            "SELECT 1 FROM provider_credentials WHERE provider_id = ?",
            (provider_id,),
        ).fetchone()
    return row is not None


def store_credential(provider_id: str, api_key: str) -> None:
    encrypted = _cipher().encrypt(api_key.encode("utf-8"))
    with _database() as connection:
        connection.execute(
            """
            INSERT INTO provider_credentials(provider_id, encrypted_api_key, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(provider_id) DO UPDATE SET
                encrypted_api_key = excluded.encrypted_api_key,
                updated_at = CURRENT_TIMESTAMP
            """,
            (provider_id, encrypted),
        )


def delete_credential(provider_id: str) -> bool:
    with _database() as connection:
        cursor = connection.execute(
            "DELETE FROM provider_credentials WHERE provider_id = ?",
            (provider_id,),
        )
        deleted = cursor.rowcount > 0
    return deleted


def _load_credential_for_provider_execution(provider_id: str) -> str | None:
    """Internal-only secret access for trusted provider adapters; never expose via HTTP."""
    with _database() as connection:
        row = connection.execute(
            "SELECT encrypted_api_key FROM provider_credentials WHERE provider_id = ?",
            (provider_id,),
        ).fetchone()
    if row is None:
        return None
    try:
        return _cipher().decrypt(bytes(row[0])).decode("utf-8")
    except (InvalidToken, UnicodeDecodeError) as exc:
        raise VaultIntegrityError("Stored provider credential could not be decrypted.") from exc


def store_workspace_credential(workspace_id: str, provider_id: str, api_key: str) -> None:
    encrypted = _cipher().encrypt(api_key.encode("utf-8"))
    with _database() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS workspace_provider_credentials (
                workspace_id TEXT NOT NULL,
                provider_id TEXT NOT NULL,
                encrypted_api_key BLOB NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(workspace_id, provider_id)
            )
        """)
        connection.execute("""
            INSERT INTO workspace_provider_credentials(workspace_id,provider_id,encrypted_api_key,updated_at)
            VALUES(?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(workspace_id,provider_id) DO UPDATE SET
              encrypted_api_key=excluded.encrypted_api_key, updated_at=CURRENT_TIMESTAMP
        """, (workspace_id, provider_id, encrypted))


def workspace_credential_exists(workspace_id: str, provider_id: str) -> bool:
    with _database() as connection:
        connection.execute("""CREATE TABLE IF NOT EXISTS workspace_provider_credentials (
            workspace_id TEXT NOT NULL, provider_id TEXT NOT NULL, encrypted_api_key BLOB NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(workspace_id,provider_id))""")
        row = connection.execute("SELECT 1 FROM workspace_provider_credentials WHERE workspace_id=? AND provider_id=?",
                                 (workspace_id, provider_id)).fetchone()
    return row is not None


def delete_workspace_credential(workspace_id: str, provider_id: str) -> bool:
    with _database() as connection:
        connection.execute("""CREATE TABLE IF NOT EXISTS workspace_provider_credentials (
            workspace_id TEXT NOT NULL, provider_id TEXT NOT NULL, encrypted_api_key BLOB NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(workspace_id,provider_id))""")
        return connection.execute("DELETE FROM workspace_provider_credentials WHERE workspace_id=? AND provider_id=?",
                                  (workspace_id, provider_id)).rowcount > 0


def _load_workspace_credential_for_execution(workspace_id: str, provider_id: str) -> str | None:
    with _database() as connection:
        connection.execute("""CREATE TABLE IF NOT EXISTS workspace_provider_credentials (
            workspace_id TEXT NOT NULL, provider_id TEXT NOT NULL, encrypted_api_key BLOB NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(workspace_id,provider_id))""")
        row = connection.execute("SELECT encrypted_api_key FROM workspace_provider_credentials WHERE workspace_id=? AND provider_id=?",
                                 (workspace_id, provider_id)).fetchone()
    if row is None:
        return None
    try:
        return _cipher().decrypt(bytes(row[0])).decode("utf-8")
    except (InvalidToken, UnicodeDecodeError) as exc:
        raise VaultIntegrityError("Stored provider credential could not be decrypted.") from exc
