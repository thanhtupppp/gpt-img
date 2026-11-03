import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .security import require_bridge_token
from .store import get_package, save_package, submit_execution
from .worker_store import get_worker_execution, request_execution_cancel, worker_available

router = APIRouter(
    prefix="/api/v1/bridge",
    tags=["bridge"],
    dependencies=[Depends(require_bridge_token)],
)

PACKAGE_FORMAT = "piecs-prompt-package"
PACKAGE_VERSION = "1.0.0"
MAX_PACKAGE_BYTES = 5 * 1024 * 1024
MAX_GRAPH_BYTES = 1024 * 1024
SECRET_FIELD_NAMES = {
    "api_key", "apikey", "admin_token", "admintoken", "bridge_token", "bridgetoken",
    "piecs_admin_token", "piecsadmintoken", "piecs_bridge_token", "piecsbridgetoken",
    "credential", "credentials", "provider_secret", "providercredential",
    "providercredentials", "private_key", "privatekey", "client_secret", "clientsecret",
}


def _reject_secret_fields(value: Any, path: str = "payload") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if key.lower().replace("-", "_") in SECRET_FIELD_NAMES:
                raise ValueError(f"Sensitive field is not allowed at {path}.{key}.")
            _reject_secret_fields(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_secret_fields(child, f"{path}[{index}]")


class PackageInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    format: str
    packageVersion: str
    exportedAt: str
    templates: list[dict[str, Any]]
    workflows: list[dict[str, Any]]
    workflowGraphs: list[dict[str, Any]] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_package(self):
        if self.format != PACKAGE_FORMAT or self.packageVersion != PACKAGE_VERSION:
            raise ValueError("Unsupported Prompt Package format or version.")
        if not self.templates and not self.workflows and not self.workflowGraphs:
            raise ValueError("Prompt Package must contain at least one supported item.")
        _reject_secret_fields(self.model_dump())
        if len(json.dumps(self.model_dump(), separators=(",", ":"), ensure_ascii=False).encode("utf-8")) > MAX_PACKAGE_BYTES:
            raise ValueError("Prompt Package exceeds the 5 MB limit.")
        return self


class WorkflowNode(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=128)
    commandId: str = Field(min_length=1, max_length=128)
    parameters: dict[str, str | int | float | bool] = Field(default_factory=dict)

    @field_validator("parameters")
    @classmethod
    def finite_parameters(cls, value):
        import math
        if any(isinstance(item, float) and not math.isfinite(item) for item in value.values()):
            raise ValueError("Workflow parameters must contain finite numbers.")
        return value


class WorkflowEdge(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    id: str = Field(min_length=1, max_length=128)
    from_: str = Field(alias="from", min_length=1, max_length=128)
    to: str = Field(min_length=1, max_length=128)


class WorkflowGraphInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schemaVersion: str
    nodes: list[WorkflowNode] = Field(min_length=1, max_length=200)
    edges: list[WorkflowEdge] = Field(default_factory=list, max_length=1000)

    @model_validator(mode="after")
    def validate_dag(self):
        if self.schemaVersion != "1.0.0":
            raise ValueError("Unsupported workflow graph schema version.")
        node_ids = [node.id for node in self.nodes]
        edge_ids = [edge.id for edge in self.edges]
        if len(set(node_ids)) != len(node_ids) or len(set(edge_ids)) != len(edge_ids):
            raise ValueError("Workflow graph contains duplicate node or edge IDs.")
        known = set(node_ids)
        indegree = {node_id: 0 for node_id in node_ids}
        children = {node_id: [] for node_id in node_ids}
        for edge in self.edges:
            if edge.from_ not in known or edge.to not in known or edge.from_ == edge.to:
                raise ValueError("Workflow graph contains an invalid edge.")
            children[edge.from_].append(edge.to)
            indegree[edge.to] += 1
        ready = [node_id for node_id, degree in indegree.items() if degree == 0]
        visited = 0
        while ready:
            current = ready.pop()
            visited += 1
            for child in children[current]:
                indegree[child] -= 1
                if indegree[child] == 0:
                    ready.append(child)
        if visited != len(node_ids):
            raise ValueError("Workflow graph contains a cycle.")
        return self


class WorkflowSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    graphId: str = Field(min_length=1, max_length=128)
    graph: WorkflowGraphInput

    @model_validator(mode="after")
    def validate_size_and_secrets(self):
        payload = self.model_dump(by_alias=True)
        _reject_secret_fields(payload)
        if len(json.dumps(payload, separators=(",", ":")).encode("utf-8")) > MAX_GRAPH_BYTES:
            raise ValueError("Workflow submission exceeds the 1 MB limit.")
        return self


@router.get("/capabilities")
def get_bridge_capabilities():
    """Advertise worker support only after the separately deployed worker is configured."""
    from ..config import get_settings
    settings = get_settings()
    storage_configured = all((
        settings.asset_s3_endpoint, settings.asset_s3_bucket,
        settings.asset_s3_access_key, settings.asset_s3_secret_key,
    ))
    return {
        "service": "piecs-bridge",
        "api_version": "v1",
        "package_schema_versions": [PACKAGE_VERSION],
        "capabilities": {
            "capability_discovery": True,
            "prompt_package_import": True,
            "prompt_package_export": True,
            "workflow_submission": True,
            "execution_status": True,
            "workflow_execution_worker": storage_configured and worker_available(),
            "workflow_asset_storage": storage_configured,
            "workflow_cancellation": True,
            "webhooks": False,
        },
    }


@router.post("/packages", status_code=status.HTTP_201_CREATED)
def import_prompt_package(payload: PackageInput):
    return save_package(payload.model_dump())


@router.get("/packages/{package_id}")
def export_prompt_package(package_id: UUID):
    result = get_package(str(package_id))
    if result is None:
        raise HTTPException(status_code=404, detail={"code": "PACKAGE_NOT_FOUND", "message": "Prompt Package was not found."})
    return result


@router.post("/workflows", status_code=status.HTTP_202_ACCEPTED)
def submit_workflow(
    payload: WorkflowSubmission,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    if idempotency_key is not None and (not idempotency_key.strip() or len(idempotency_key) > 128):
        raise HTTPException(status_code=422, detail={"code": "INVALID_IDEMPOTENCY_KEY", "message": "Idempotency-Key must contain 1–128 characters."})
    try:
        result = submit_execution(payload.graphId, payload.model_dump(by_alias=True), idempotency_key)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT", "message": str(exc)}) from exc
    return {**result, "message": "Workflow accepted and queued."}


@router.get("/executions/{execution_id}")
def get_workflow_execution(execution_id: UUID):
    result = get_worker_execution(str(execution_id))
    if result is None:
        raise HTTPException(status_code=404, detail={"code": "EXECUTION_NOT_FOUND", "message": "Workflow execution was not found."})
    return result


@router.post("/executions/{execution_id}/cancel", status_code=status.HTTP_202_ACCEPTED)
def cancel_workflow_execution(execution_id: UUID):
    if not request_execution_cancel(str(execution_id)):
        raise HTTPException(status_code=409, detail={"code": "EXECUTION_NOT_CANCELLABLE", "message": "Execution is missing or already terminal."})
    return {"executionId": str(execution_id), "cancellationRequested": True}
