"""OIDC bearer-token validation and authenticated principal extraction."""

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import jwt
from fastapi import Header, HTTPException, status
from jwt import PyJWKClient
from jwt.exceptions import PyJWTError

from ..config import get_settings

_ALLOWED_ALGORITHMS = {"RS256", "RS384", "ES256", "ES384"}


@dataclass(frozen=True)
class Principal:
    """Minimal trusted identity derived only from a validated OIDC token."""

    subject: str
    issuer: str
    audiences: tuple[str, ...]
    scopes: tuple[str, ...]


@lru_cache(maxsize=8)
def _jwks_client(url: str) -> PyJWKClient:
    return PyJWKClient(url, timeout=5, cache_keys=True)


def _oidc_configuration():
    settings = get_settings()
    issuer = settings.oidc_issuer.strip()
    audience = settings.oidc_audience.strip()
    jwks_url = settings.oidc_jwks_url.strip()
    algorithms = tuple(item.strip() for item in settings.oidc_algorithms.split(",") if item.strip())
    if not issuer or not audience or not jwks_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "OIDC_NOT_CONFIGURED", "message": "OIDC authentication is not configured."},
        )
    if not algorithms or any(item not in _ALLOWED_ALGORITHMS for item in algorithms):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "OIDC_ALGORITHM_CONFIGURATION_INVALID", "message": "OIDC signing algorithms are not configured safely."},
        )
    return issuer, audience, jwks_url, algorithms


def _extract_bearer(authorization: str | None) -> str:
    scheme, separator, token = (authorization or "").partition(" ")
    normalized = token.strip()
    if not separator or scheme.lower() != "bearer" or not normalized or " " in normalized:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTHENTICATION_REQUIRED", "message": "A valid bearer token is required."},
            headers={"WWW-Authenticate": "Bearer"},
        )
    return normalized


def _decode_principal(token: str) -> Principal:
    issuer, audience, jwks_url, algorithms = _oidc_configuration()
    try:
        signing_key = _jwks_client(jwks_url).get_signing_key_from_jwt(token)
        claims: dict[str, Any] = jwt.decode(
            token,
            signing_key.key,
            algorithms=list(algorithms),
            issuer=issuer,
            audience=audience,
            options={"require": ["exp", "iss", "sub", "aud"]},
            leeway=30,
        )
    except PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_ACCESS_TOKEN", "message": "The bearer token is invalid or expired."},
            headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
        ) from exc

    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_ACCESS_TOKEN", "message": "The bearer token has no valid subject."},
            headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
        )
    raw_audiences = claims.get("aud")
    audiences = (raw_audiences,) if isinstance(raw_audiences, str) else tuple(raw_audiences)
    raw_scopes = claims.get("scope", claims.get("scp", ""))
    if isinstance(raw_scopes, str):
        scopes = tuple(sorted(set(raw_scopes.split())))
    elif isinstance(raw_scopes, list) and all(isinstance(item, str) for item in raw_scopes):
        scopes = tuple(sorted(set(raw_scopes)))
    else:
        scopes = ()
    return Principal(subject=subject, issuer=issuer, audiences=audiences, scopes=scopes)


def require_user(authorization: str | None = Header(default=None)) -> Principal:
    return _decode_principal(_extract_bearer(authorization))
