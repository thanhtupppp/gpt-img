from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .gemini import (
    DEFAULT_IMAGE_MODEL,
    SUPPORTED_ASPECT_RATIOS,
    SUPPORTED_IMAGE_MODELS,
    SUPPORTED_IMAGE_SIZES,
    GeminiAdapterError,
    GeminiImageAdapter,
)

router = APIRouter(prefix="/api/v1/providers/gemini", tags=["gemini"])


class ImageGenerationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prompt: str = Field(min_length=1, max_length=12000)
    model: str = Field(default=DEFAULT_IMAGE_MODEL)
    image_base64: str | None = Field(default=None, max_length=14_000_000, repr=False)
    mime_type: str | None = None
    aspect_ratio: str = "1:1"
    image_size: str = "1K"

    @model_validator(mode="after")
    def validate_options(self):
        if self.model not in SUPPORTED_IMAGE_MODELS:
            raise ValueError("Unsupported Gemini image model.")
        if self.aspect_ratio not in SUPPORTED_ASPECT_RATIOS:
            raise ValueError("Unsupported image aspect ratio.")
        if self.image_size not in SUPPORTED_IMAGE_SIZES:
            raise ValueError("Unsupported image size.")
        if self.image_base64 is None and self.mime_type is not None:
            raise ValueError("mime_type requires image_base64.")
        return self


def _raise_adapter_error(exc: GeminiAdapterError):
    raise HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": str(exc)},
    ) from exc


@router.post("/test")
def test_gemini_connection():
    try:
        return GeminiImageAdapter().test_connection()
    except GeminiAdapterError as exc:
        _raise_adapter_error(exc)


@router.post("/images")
def generate_or_edit_image(payload: ImageGenerationInput):
    try:
        return GeminiImageAdapter().generate_image(
            prompt=payload.prompt,
            model=payload.model,
            image_base64=payload.image_base64,
            mime_type=payload.mime_type,
            aspect_ratio=payload.aspect_ratio,
            image_size=payload.image_size,
        )
    except GeminiAdapterError as exc:
        _raise_adapter_error(exc)
