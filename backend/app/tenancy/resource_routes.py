"""OIDC-authenticated, workspace-scoped Bridge and Provider Vault APIs."""
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from ..auth.oidc import Principal, require_user
from ..bridge.routes import PackageInput, WorkflowSubmission
from ..bridge.store import save_workspace_package, get_workspace_package, submit_workspace_execution
from ..bridge.worker_store import get_worker_execution, request_execution_cancel
from ..providers.catalog import PROVIDERS, public_provider
from ..providers.vault import (
    VaultNotConfiguredError, store_workspace_credential,
    workspace_credential_exists, delete_workspace_credential,
)
from .store import require_role
from .usage import QuotaExceededError, get_workspace_usage, set_workspace_quota

router = APIRouter(prefix="/api/v1/workspaces/{workspace_id}", tags=["workspace-resources"])


class WorkspaceCredentialInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_key: str = Field(min_length=8, max_length=4096, repr=False)


class WorkspaceQuotaInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    monthly_units: int | None = Field(ge=0, le=1_000_000_000)


def _access(principal: Principal, workspace_id: UUID, role: str = "viewer") -> str:
    require_role(principal.issuer, principal.subject, str(workspace_id), role)
    return str(workspace_id)


@router.post("/bridge/packages", status_code=status.HTTP_201_CREATED)
def workspace_import_package(workspace_id: UUID, payload: PackageInput,
                             principal: Principal = Depends(require_user)):
    wid = _access(principal, workspace_id, "member")
    return save_workspace_package(wid, payload.model_dump())


@router.get("/bridge/packages/{package_id}")
def workspace_export_package(workspace_id: UUID, package_id: UUID,
                             principal: Principal = Depends(require_user)):
    wid = _access(principal, workspace_id)
    result = get_workspace_package(wid, str(package_id))
    if result is None:
        raise HTTPException(status_code=404, detail={"code": "PACKAGE_NOT_FOUND", "message": "Package was not found."})
    return result


@router.post("/bridge/workflows", status_code=status.HTTP_202_ACCEPTED)
def workspace_submit_workflow(workspace_id: UUID, payload: WorkflowSubmission,
                              idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
                              principal: Principal = Depends(require_user)):
    wid = _access(principal, workspace_id, "member")
    if idempotency_key is not None and (not idempotency_key.strip() or len(idempotency_key) > 128):
        raise HTTPException(status_code=422, detail={"code": "INVALID_IDEMPOTENCY_KEY", "message": "Idempotency-Key must contain 1–128 characters."})
    try:
        result = submit_workspace_execution(wid, payload.graphId, payload.model_dump(by_alias=True), idempotency_key)
    except QuotaExceededError as exc:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "WORKSPACE_QUOTA_EXCEEDED",
                "message": "Workspace monthly workflow quota would be exceeded.",
                "usedUnits": exc.used,
                "reservedUnits": exc.reserved,
                "requestedUnits": exc.requested,
                "monthlyQuotaUnits": exc.quota,
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT", "message": str(exc)}) from exc
    return {**result, "message": "Workflow accepted and queued."}


@router.get("/bridge/executions/{execution_id}")
def workspace_execution_status(workspace_id: UUID, execution_id: UUID,
                                principal: Principal = Depends(require_user)):
    wid = _access(principal, workspace_id)
    result = get_worker_execution(str(execution_id), wid)
    if result is None:
        raise HTTPException(status_code=404, detail={"code": "EXECUTION_NOT_FOUND", "message": "Execution was not found."})
    return result


@router.post("/bridge/executions/{execution_id}/cancel", status_code=status.HTTP_202_ACCEPTED)
def workspace_cancel_execution(workspace_id: UUID, execution_id: UUID,
                               principal: Principal = Depends(require_user)):
    wid = _access(principal, workspace_id, "member")
    if not request_execution_cancel(str(execution_id), wid):
        raise HTTPException(status_code=409, detail={"code": "EXECUTION_NOT_CANCELLABLE", "message": "Execution is missing or already terminal."})
    return {"executionId": str(execution_id), "cancellationRequested": True}


@router.get("/usage")
def workspace_usage(workspace_id: UUID, principal: Principal = Depends(require_user)):
    wid = _access(principal, workspace_id)
    return get_workspace_usage(wid)


@router.put("/usage/quota")
def workspace_update_quota(
    workspace_id: UUID,
    payload: WorkspaceQuotaInput,
    principal: Principal = Depends(require_user),
):
    wid = _access(principal, workspace_id, "admin")
    return set_workspace_quota(wid, payload.monthly_units)


@router.get("/providers")
def workspace_list_providers(workspace_id: UUID, principal: Principal = Depends(require_user)):
    wid = _access(principal, workspace_id)
    return {"items": [public_provider(pid, workspace_credential_exists(wid, pid)) for pid in PROVIDERS]}


@router.put("/providers/{provider_id}/credentials", status_code=status.HTTP_204_NO_CONTENT)
def workspace_upsert_credential(workspace_id: UUID, provider_id: str, payload: WorkspaceCredentialInput,
                                principal: Principal = Depends(require_user)):
    wid = _access(principal, workspace_id, "admin")
    if provider_id not in PROVIDERS:
        raise HTTPException(status_code=404, detail={"code": "PROVIDER_NOT_FOUND", "message": "Provider not found."})
    try:
        store_workspace_credential(wid, provider_id, payload.api_key)
    except VaultNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail={"code": "VAULT_NOT_CONFIGURED", "message": "Provider Vault is not configured."}) from exc
    return None


@router.delete("/providers/{provider_id}/credentials", status_code=status.HTTP_204_NO_CONTENT)
def workspace_delete_credential(workspace_id: UUID, provider_id: str,
                                principal: Principal = Depends(require_user)):
    wid = _access(principal, workspace_id, "admin")
    if provider_id not in PROVIDERS:
        raise HTTPException(status_code=404, detail={"code": "PROVIDER_NOT_FOUND", "message": "Provider not found."})
    delete_workspace_credential(wid, provider_id)
    return None
