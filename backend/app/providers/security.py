import secrets

from fastapi import Header, HTTPException, status

from ..config import get_settings


def require_admin(authorization: str | None = Header(default=None)) -> None:
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
