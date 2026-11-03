from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from ..auth.oidc import Principal, require_user
from .store import (
    MemberSuspendedError, OwnerProtectedError,
    add_member, change_member_role, create_workspace, list_members,
    list_workspaces, remove_member,
)

router = APIRouter(prefix="/api/v1/workspaces", tags=["workspaces"])


class WorkspaceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]


class MemberInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    issuer: str = Field(min_length=1, max_length=512)
    subject: str = Field(min_length=1, max_length=255)
    role: str = Field(pattern="^(admin|member|viewer)$")


class MemberRoleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: str = Field(pattern="^(admin|member|viewer)$")


def _owner_protected(exc: Exception) -> HTTPException:
    return HTTPException(status_code=409, detail={"code": "OWNER_PROTECTED", "message": str(exc)})


@router.post("", status_code=201)
def create_workspace_route(payload: WorkspaceInput, principal: Principal = Depends(require_user)):
    return create_workspace(principal.issuer, principal.subject, payload.name)


@router.get("")
def list_workspaces_route(principal: Principal = Depends(require_user)):
    return {"items": list_workspaces(principal.issuer, principal.subject)}


@router.get("/{workspace_id}/members")
def workspace_members(workspace_id: str, principal: Principal = Depends(require_user)):
    return {"items": list_members(principal.issuer, principal.subject, workspace_id)}


@router.post("/{workspace_id}/members", status_code=204)
def invite_member(workspace_id: str, payload: MemberInput, principal: Principal = Depends(require_user)):
    try:
        add_member(principal.issuer, principal.subject, workspace_id, payload.issuer, payload.subject, payload.role)
    except OwnerProtectedError as exc:
        raise _owner_protected(exc) from exc
    except MemberSuspendedError as exc:
        raise HTTPException(status_code=409, detail={"code": "MEMBER_SUSPENDED", "message": str(exc)}) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code":"INVALID_ROLE","message":str(exc)}) from exc
    return None


@router.patch("/{workspace_id}/members/role", status_code=204)
def update_member_role(workspace_id: str, payload: MemberInput, principal: Principal = Depends(require_user)):
    try:
        change_member_role(principal.issuer, principal.subject, workspace_id, payload.issuer, payload.subject, payload.role)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail={"code":"MEMBER_NOT_FOUND","message":"Workspace member was not found."}) from exc
    except OwnerProtectedError as exc:
        raise _owner_protected(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code":"INVALID_ROLE","message":str(exc)}) from exc
    return None


@router.delete("/{workspace_id}/members", status_code=204)
def delete_member(workspace_id: str, issuer: str, subject: str, principal: Principal = Depends(require_user)):
    try:
        remove_member(principal.issuer, principal.subject, workspace_id, issuer, subject)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail={"code":"MEMBER_NOT_FOUND","message":"Workspace member was not found."}) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail={"code":"OWNER_PROTECTED","message":str(exc)}) from exc
    return None
