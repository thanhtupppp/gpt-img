import secrets

from fastapi import Header, HTTPException, status

from ..config import get_settings


def require_bridge_token(authorization: str | None = Header(default=None)) -> None:
    expected = get_settings().bridge_token
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "BRIDGE_AUTH_NOT_CONFIGURED", "message": "Bridge access is not configured."},
        )

    scheme, separator, supplied = (authorization or "").partition(" ")
    if (
        not separator
        or scheme.lower() != "bearer"
        or not supplied
        or not secrets.compare_digest(supplied, expected)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "BRIDGE_UNAUTHORIZED", "message": "Valid bridge bearer authentication is required."},
            headers={"WWW-Authenticate": "Bearer"},
        )
