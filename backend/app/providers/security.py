import secrets

from fastapi import Header, HTTPException, Request, status

from ..config import get_settings
from ..security_controls import enforce_rate_limit


def require_admin(request: Request, authorization: str | None = Header(default=None)) -> None:
    expected = get_settings().admin_token
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "ADMIN_AUTH_NOT_CONFIGURED", "message": "Provider management is not configured."},
        )

    scheme, separator, supplied = (authorization or "").partition(" ")
    if (
        not separator
        or scheme.lower() != "bearer"
        or not secrets.compare_digest(supplied, expected)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "Valid bearer authentication is required."},
            headers={"WWW-Authenticate": "Bearer"},
        )

    request.state.audit_actor_type = "admin_service"
    request.state.audit_actor_identity = expected
    enforce_rate_limit(expected, category="admin-service")
