"""S3-compatible asset storage (Cloudflare R2 supported)."""
import os
from functools import lru_cache
from typing import Any

from ..config import get_settings


class AssetStoreNotConfigured(RuntimeError):
    pass


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


def put_image(asset_id: str, data: bytes, mime_type: str) -> dict[str, Any]:
    if mime_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise ValueError("Unsupported workflow asset MIME type.")
    if not data or len(data) > 25 * 1024 * 1024:
        raise ValueError("Workflow asset must be between 1 byte and 25 MiB.")
    key = f"piecs/workflow-assets/{asset_id}"
    settings = get_settings()
    _client().put_object(
        Bucket=settings.asset_s3_bucket,
        Key=key,
        Body=data,
        ContentType=mime_type,
        Metadata={"asset-id": asset_id},
    )
    return {"id": asset_id, "key": key, "mimeType": mime_type, "size": len(data)}


def get_image(asset_id: str) -> tuple[bytes, str]:
    settings = get_settings()
    key = f"piecs/workflow-assets/{asset_id}"
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
