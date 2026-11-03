"""Reusable workspace authorization dependencies for resource routers."""
from fastapi import Depends, Header, HTTPException

from ..auth.oidc import Principal, require_user
from .store import require_role


def workspace_access(minimum_role: str = "viewer"):
    """Resolve the workspace from the route and authorize the OIDC principal.

    Route handlers must declare a path parameter named workspace_id. The ID is
    never treated as proof of membership; membership is loaded from the database.
    """
    def dependency(
        workspace_id: str,
        principal: Principal = Depends(require_user),
    ):
        return require_role(principal.issuer, principal.subject, workspace_id, minimum_role)
    return dependency


def assert_workspace_resource(workspace_id: str, resource_workspace_id: str | None) -> None:
    """Fail closed when a resource is unscoped or belongs to another workspace."""
    if not resource_workspace_id or resource_workspace_id != workspace_id:
        raise HTTPException(
            status_code=404,
            detail={"code": "RESOURCE_NOT_FOUND", "message": "Resource was not found."},
        )
