from fastapi import APIRouter, Depends

from .oidc import Principal, require_user

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])


@router.get("/me")
def get_current_user(principal: Principal = Depends(require_user)):
    """Return the minimal identity established by the validated OIDC token."""
    return {
        "subject": principal.subject,
        "issuer": principal.issuer,
        "audiences": list(principal.audiences),
        "scopes": list(principal.scopes),
    }
