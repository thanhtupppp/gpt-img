"""S3-compatible asset storage (Cloudflare R2 supported)."""
import os
import re
from functools import lru_cache
from typing import Any

from ..config import get_settings

_ASSET_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")


class AssetStoreNotConfigured(RuntimeError):
    pass


def _validate_asset_id(asset_id: str) -> str:
    """Reject IDs that could alter the S3 key path (slashes, dot segments, encoded chars)."""
    if not isinstance(asset_id, str) or not _ASSET_ID_PATTERN.fullmatch(asset_id) or ".." in asset_id:
        raise ValueError("Invalid workflow asset id.")
    return asset_id


@lru_cache
def _client():
    settings = get_settings()
    if not all((settings.asset_s3_endpoint, settings.asset_s3_bucket, settings.asset_s3_access_key, settings.asset_s3_secret_key)):
        raise AssetStoreNotConfigured("Workflow asset storage is not configured.")
    try:
        import boto3
    except ImportError as exc:
        raise AssetStoreNotConfigured("Install boto3 to enable S3-compatible workflow asset storage.") from exc
    return boto3.client(
        "s3",
        endpoint_url=settings.asset_s3_endpoint,
        region_name=settings.asset_s3_region,
        aws_access_key_id=settings.asset_s3_access_key,
        aws_secret_access_key=settings.asset_s3_secret_key,
    )


def put_image(asset_id: str, data: bytes, mime_type: str, workspace_id: str | None = None) -> dict[str, Any]:
    _validate_asset_id(asset_id)
    if mime_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise ValueError("Unsupported workflow asset MIME type.")
    if not data or len(data) > 25 * 1024 * 1024:
        raise ValueError("Workflow asset must be between 1 byte and 25 MiB.")
    key = f"piecs/workspace-assets/{workspace_id}/{asset_id}" if workspace_id else f"piecs/workflow-assets/{asset_id}"
    settings = get_settings()
    _client().put_object(
        Bucket=settings.asset_s3_bucket,
        Key=key,
        Body=data,
        ContentType=mime_type,
        Metadata={"asset-id": asset_id, **({"workspace-id": workspace_id} if workspace_id else {})},
    )
    return {"id": asset_id, "key": key, "mimeType": mime_type, "size": len(data)}


def get_image(asset_id: str, workspace_id: str | None = None) -> tuple[bytes, str]:
    _validate_asset_id(asset_id)
    settings = get_settings()
    key = f"piecs/workspace-assets/{workspace_id}/{asset_id}" if workspace_id else f"piecs/workflow-assets/{asset_id}"
    result = _client().get_object(Bucket=settings.asset_s3_bucket, Key=key)
    body = result["Body"]
    try:
        data = body.read(25 * 1024 * 1024 + 1)
    finally:
        body.close()
    if len(data) > 25 * 1024 * 1024:
        raise ValueError("Stored workflow asset exceeds the 25 MiB limit.")
    mime_type = result.get("ContentType", "application/octet-stream")
    if mime_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise ValueError("Stored workflow asset has an unsupported MIME type.")
    return data, mime_type
