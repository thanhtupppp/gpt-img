import sqlite3
from pathlib import Path

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


def _connect() -> sqlite3.Connection:
    path = Path(get_settings().database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10)
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS provider_credentials (
            provider_id TEXT PRIMARY KEY,
            encrypted_api_key BLOB NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    return connection


def credential_exists(provider_id: str) -> bool:
    with _connect() as connection:
        row = connection.execute(
            "SELECT 1 FROM provider_credentials WHERE provider_id = ?",
            (provider_id,),
        ).fetchone()
    return row is not None


def store_credential(provider_id: str, api_key: str) -> None:
    encrypted = _cipher().encrypt(api_key.encode("utf-8"))
    with _connect() as connection:
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
    with _connect() as connection:
        cursor = connection.execute(
            "DELETE FROM provider_credentials WHERE provider_id = ?",
            (provider_id,),
        )
    return cursor.rowcount > 0


def _load_credential_for_provider_execution(provider_id: str) -> str | None:
    """Internal-only secret access for trusted provider adapters; never expose via HTTP."""
    with _connect() as connection:
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
