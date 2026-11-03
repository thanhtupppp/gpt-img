import base64
import binascii
from typing import Any

import httpx

from .vault import VaultIntegrityError, _load_credential_for_provider_execution, _load_workspace_credential_for_execution

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_IMAGE_MODEL = "gemini-nano-banana-2.1"
SUPPORTED_IMAGE_MODELS = {
    "gemini-nano-banana-2.1",
    "gemini-3.1-flash-image",
    "gemini-3.1-flash-lite-image",
    "gemini-3-pro-image",
}
SUPPORTED_IMAGE_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}
SUPPORTED_ASPECT_RATIOS = {
    "1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3",
    "4:5", "5:4", "8:1", "9:16", "16:9", "21:9",
}
SUPPORTED_IMAGE_SIZES = {"1K", "2K", "4K"}


class GeminiAdapterError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int = 502):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def _api_key(workspace_id: str | None = None) -> str:
    try:
        key = (_load_workspace_credential_for_execution(workspace_id, "gemini")
               if workspace_id else _load_credential_for_provider_execution("gemini"))
    except VaultIntegrityError as exc:
        raise GeminiAdapterError("CREDENTIAL_VAULT_ERROR", "Stored Gemini credentials are unavailable.", 503) from exc
    if not key:
        raise GeminiAdapterError("CREDENTIAL_NOT_CONFIGURED", "Configure a Gemini API key first.", 409)
    return key


def _map_upstream_error(response: httpx.Response) -> GeminiAdapterError:
    if response.status_code in (401, 403):
        return GeminiAdapterError("INVALID_CREDENTIAL", "Gemini rejected the configured API key.", 422)
    if response.status_code == 429:
        return GeminiAdapterError("PROVIDER_RATE_LIMITED", "Gemini rate limit reached. Try again later.", 429)
    if response.status_code >= 500:
        return GeminiAdapterError("PROVIDER_UNAVAILABLE", "Gemini is temporarily unavailable.", 502)
    return GeminiAdapterError("PROVIDER_REQUEST_REJECTED", "Gemini rejected the request.", 422)


class GeminiImageAdapter:
    def __init__(self, client: httpx.Client | None = None, workspace_id: str | None = None):
        self._workspace_id = workspace_id
        self._client = client or httpx.Client(timeout=httpx.Timeout(120.0, connect=10.0))

    def test_connection(self) -> dict[str, Any]:
        key = _api_key(self._workspace_id) if self._workspace_id else _api_key()
        try:
            response = self._client.get(
                f"{GEMINI_API_BASE}/models/{DEFAULT_IMAGE_MODEL}",
                headers={"x-goog-api-key": key},
            )
        except httpx.TimeoutException as exc:
            raise GeminiAdapterError("PROVIDER_TIMEOUT", "Gemini did not respond before the timeout.", 504) from exc
        except httpx.HTTPError as exc:
            raise GeminiAdapterError("PROVIDER_CONNECTION_FAILED", "Could not reach Gemini.", 502) from exc
        if not response.is_success:
            raise _map_upstream_error(response)
        payload = response.json()
        return {
            "provider": "gemini",
            "model": DEFAULT_IMAGE_MODEL,
            "available": payload.get("name") == f"models/{DEFAULT_IMAGE_MODEL}",
        }

    def generate_image(
        self,
        prompt: str,
        model: str = DEFAULT_IMAGE_MODEL,
        image_base64: str | None = None,
        mime_type: str | None = None,
        aspect_ratio: str = "1:1",
        image_size: str = "1K",
    ) -> dict[str, Any]:
        if model not in SUPPORTED_IMAGE_MODELS:
            raise GeminiAdapterError("UNSUPPORTED_MODEL", "The requested Gemini image model is not supported.", 422)
        if aspect_ratio not in SUPPORTED_ASPECT_RATIOS or image_size not in SUPPORTED_IMAGE_SIZES:
            raise GeminiAdapterError("INVALID_IMAGE_OPTIONS", "The requested image options are not supported.", 422)
        content: list[dict[str, str]] = [{"type": "text", "text": prompt}]
        if image_base64 is not None:
            if mime_type not in SUPPORTED_IMAGE_MIME_TYPES:
                raise GeminiAdapterError("UNSUPPORTED_IMAGE_TYPE", "Use PNG, JPEG, or WebP input images.", 422)
            try:
                raw_image = base64.b64decode(image_base64, validate=True)
            except (binascii.Error, ValueError) as exc:
                raise GeminiAdapterError("INVALID_IMAGE_DATA", "The input image must be valid base64.", 422) from exc
            if not raw_image:
                raise GeminiAdapterError("INVALID_IMAGE_DATA", "The input image is empty.", 422)
            content.append({"type": "image", "mime_type": mime_type, "data": base64.b64encode(raw_image).decode("ascii")})

        key = _api_key(self._workspace_id)
        body = {
            "model": model,
            "input": content if image_base64 is not None else prompt,
            "response_format": {
                "type": "image",
                "aspect_ratio": aspect_ratio,
                "image_size": image_size,
            },
        }
        try:
            response = self._client.post(
                f"{GEMINI_API_BASE}/interactions",
                headers={"x-goog-api-key": key, "Content-Type": "application/json", "Api-Revision": "2026-05-20"},
                json=body,
            )
        except httpx.TimeoutException as exc:
            raise GeminiAdapterError("PROVIDER_TIMEOUT", "Gemini image generation timed out.", 504) from exc
        except httpx.HTTPError as exc:
            raise GeminiAdapterError("PROVIDER_CONNECTION_FAILED", "Could not reach Gemini.", 502) from exc
        if not response.is_success:
            raise _map_upstream_error(response)

        payload = response.json()
        output_image = payload.get("output_image") or {}
        image_data = output_image.get("data")
        output_mime = output_image.get("mime_type") or "image/png"
        if not image_data:
            raise GeminiAdapterError("IMAGE_OUTPUT_MISSING", "Gemini returned no image output.", 502)
        try:
            base64.b64decode(image_data, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise GeminiAdapterError("INVALID_PROVIDER_IMAGE", "Gemini returned invalid image data.", 502) from exc
        return {
            "provider": "gemini",
            "model": model,
            "interaction_id": payload.get("id"),
            "image": {"mime_type": output_mime, "data": image_data},
        }
