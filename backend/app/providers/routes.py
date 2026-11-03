from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from .catalog import PROVIDERS, public_provider
from .security import require_admin
from .vault import VaultNotConfiguredError, credential_exists, delete_credential, store_credential

router = APIRouter(
    prefix="/api/v1/providers",
    tags=["providers"],
    dependencies=[Depends(require_admin)],
)


class CredentialInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_key: str = Field(min_length=8, max_length=4096, repr=False)


def _require_provider(provider_id: str) -> None:
    if provider_id not in PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PROVIDER_NOT_FOUND", "message": "The requested provider is not supported."},
        )


@router.get("")
def list_providers():
    return {
        "items": [
            public_provider(provider_id, credential_exists(provider_id))
            for provider_id in PROVIDERS
        ]
    }


@router.put("/{provider_id}/credentials", status_code=status.HTTP_204_NO_CONTENT)
def upsert_provider_credential(provider_id: str, payload: CredentialInput):
    _require_provider(provider_id)
    try:
        store_credential(provider_id, payload.api_key)
    except VaultNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "VAULT_NOT_CONFIGURED", "message": str(exc)},
        ) from exc
    return None


@router.delete("/{provider_id}/credentials", status_code=status.HTTP_204_NO_CONTENT)
def remove_provider_credential(provider_id: str):
    _require_provider(provider_id)
    delete_credential(provider_id)
    return None
