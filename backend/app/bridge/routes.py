from fastapi import APIRouter, Depends

from .security import require_bridge_token

router = APIRouter(
    prefix="/api/v1/bridge",
    tags=["bridge"],
    dependencies=[Depends(require_bridge_token)],
)


@router.get("/capabilities")
def get_bridge_capabilities():
    """Describe the stable bridge boundary without exposing credentials or internals."""
    return {
        "service": "piecs-bridge",
        "api_version": "v1",
        "package_schema_versions": [],
        "capabilities": {
            "capability_discovery": True,
            "prompt_package_import": False,
            "prompt_package_export": False,
            "workflow_submission": False,
            "execution_status": False,
            "webhooks": False,
        },
    }
