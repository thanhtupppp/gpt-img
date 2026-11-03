from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app.auth import oidc
from app.main import app

client = TestClient(app)
PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class FakeSigningKey:
    key = PRIVATE_KEY.public_key()


class FakeJwksClient:
    def get_signing_key_from_jwt(self, token):
        if jwt.get_unverified_header(token).get("kid") != "test-key":
            raise jwt.InvalidKeyError("Unknown key id")
        return FakeSigningKey()


def configure_oidc(monkeypatch):
    monkeypatch.setattr(
        oidc,
        "get_settings",
        lambda: type("Settings", (), {
            "oidc_issuer": "https://identity.example.test/",
            "oidc_audience": "piecs-api",
            "oidc_jwks_url": "https://identity.example.test/.well-known/jwks.json",
            "oidc_algorithms": "RS256",
        })(),
    )
    monkeypatch.setattr(oidc, "_jwks_client", lambda url: FakeJwksClient())


def make_token(**overrides):
    now = datetime.now(timezone.utc)
    claims = {
        "sub": "user-123",
        "iss": "https://identity.example.test/",
        "aud": "piecs-api",
        "iat": now,
        "exp": now + timedelta(minutes=5),
        "scope": "profile workflow:read",
    }
    claims.update(overrides)
    return jwt.encode(claims, PRIVATE_KEY, algorithm="RS256", headers={"kid": "test-key"})


def test_auth_me_returns_minimal_validated_principal(monkeypatch):
    configure_oidc(monkeypatch)
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {make_token()}"})
    assert response.status_code == 200
    assert response.json() == {
        "subject": "user-123",
        "issuer": "https://identity.example.test/",
        "audiences": ["piecs-api"],
        "scopes": ["profile", "workflow:read"],
    }


@pytest.mark.parametrize("authorization", [None, "", "Basic abc", "Bearer", "Bearer token with spaces"])
def test_auth_me_rejects_missing_or_malformed_bearer(authorization):
    headers = {} if authorization is None else {"Authorization": authorization}
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401


def test_auth_me_rejects_expired_token(monkeypatch):
    configure_oidc(monkeypatch)
    expired = make_token(exp=datetime.now(timezone.utc) - timedelta(minutes=2))
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


@pytest.mark.parametrize("claim,value", [
    ("iss", "https://attacker.example.test"),
    ("aud", "another-api"),
    ("sub", ""),
])
def test_auth_me_rejects_wrong_issuer_audience_or_subject(monkeypatch, claim, value):
    configure_oidc(monkeypatch)
    token = make_token(**{claim: value})
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_auth_me_rejects_wrong_signature(monkeypatch):
    configure_oidc(monkeypatch)
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {"sub": "user-123", "iss": "https://identity.example.test/", "aud": "piecs-api",
         "iat": now, "exp": now + timedelta(minutes=5)},
        other_key, algorithm="RS256", headers={"kid": "test-key"},
    )
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_auth_me_fails_closed_when_oidc_is_not_configured(monkeypatch):
    monkeypatch.setattr(
        oidc,
        "get_settings",
        lambda: type("Settings", (), {
            "oidc_issuer": "", "oidc_audience": "", "oidc_jwks_url": "", "oidc_algorithms": "RS256",
        })(),
    )
    response = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer any-token"})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "OIDC_NOT_CONFIGURED"


def test_oidc_rejects_unsafe_algorithm_configuration(monkeypatch):
    monkeypatch.setattr(
        oidc,
        "get_settings",
        lambda: type("Settings", (), {
            "oidc_issuer": "https://identity.example.test",
            "oidc_audience": "piecs-api",
            "oidc_jwks_url": "https://identity.example.test/jwks",
            "oidc_algorithms": "none,HS256",
        })(),
    )
    response = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer any-token"})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "OIDC_ALGORITHM_CONFIGURATION_INVALID"
