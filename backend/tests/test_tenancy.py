from datetime import datetime, timedelta, timezone

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app.auth import oidc
from app.config import get_settings
from app.main import app
from app.tenancy import store

client = TestClient(app)
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class SigningKey:
    key = KEY.public_key()


class Jwks:
    def get_signing_key_from_jwt(self, token):
        return SigningKey()


def token(subject, issuer="https://issuer.example.test/"):
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub":subject,"iss":issuer,"aud":"piecs","iat":now,
                       "exp":now+timedelta(minutes=5)}, KEY, algorithm="RS256",
                      headers={"kid":"tenant-test"})


def setup(monkeypatch, tmp_path):
    settings = get_settings()
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "tenant.sqlite3"))
    monkeypatch.setattr(oidc, "get_settings", lambda: type("S", (), {
        "oidc_issuer":"https://issuer.example.test/","oidc_audience":"piecs",
        "oidc_jwks_url":"https://issuer.example.test/jwks","oidc_algorithms":"RS256"})())
    monkeypatch.setattr(oidc, "_jwks_client", lambda url: Jwks())


def auth(subject):
    return {"Authorization": f"Bearer {token(subject)}"}


def test_workspace_creation_and_membership_roles(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    created = client.post("/api/v1/workspaces", headers=auth("owner"), json={"name":"Alpha"})
    assert created.status_code == 201
    workspace = created.json()
    assert workspace["role"] == "owner"
    assert client.get("/api/v1/workspaces", headers=auth("owner")).json()["items"][0]["id"] == workspace["id"]

    add = client.post(f"/api/v1/workspaces/{workspace['id']}/members", headers=auth("owner"),
                      json={"issuer":"https://issuer.example.test/","subject":"viewer","role":"viewer"})
    assert add.status_code == 204
    assert client.get(f"/api/v1/workspaces/{workspace['id']}/members", headers=auth("viewer")).status_code == 200
    denied = client.post(f"/api/v1/workspaces/{workspace['id']}/members", headers=auth("viewer"),
                         json={"issuer":"https://issuer.example.test/","subject":"other","role":"member"})
    assert denied.status_code == 403


def test_cross_workspace_membership_is_not_disclosed(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    a = store.create_workspace("https://issuer.example.test/", "alice", "Alpha")
    b = store.create_workspace("https://issuer.example.test/", "bob", "Beta")
    response = client.get(f"/api/v1/workspaces/{b['id']}/members", headers=auth("alice"))
    assert response.status_code == 404


def test_owner_cannot_be_removed_or_demoted(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    workspace = store.create_workspace("https://issuer.example.test/", "owner", "Alpha")
    with __import__("pytest").raises(ValueError):
        store.change_member_role("https://issuer.example.test/", "owner", workspace["id"],
                                 "https://issuer.example.test/", "owner", "admin")
    with __import__("pytest").raises(ValueError):
        store.remove_member("https://issuer.example.test/", "owner", workspace["id"],
                            "https://issuer.example.test/", "owner")



def test_workspace_resource_api_enforces_membership_and_roles(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    issuer = "https://issuer.example.test/"
    workspace_a = store.create_workspace(issuer, "owner-a", "Alpha")
    workspace_b = store.create_workspace(issuer, "owner-b", "Beta")
    store.add_member(issuer, "owner-a", workspace_a["id"], issuer, "viewer-a", "viewer")

    own = client.get(f"/api/v1/workspaces/{workspace_a['id']}/providers", headers=auth("viewer-a"))
    assert own.status_code == 200

    cross_workspace = client.get(
        f"/api/v1/workspaces/{workspace_b['id']}/providers",
        headers=auth("viewer-a"),
    )
    assert cross_workspace.status_code == 404

    denied_secret_write = client.put(
        f"/api/v1/workspaces/{workspace_a['id']}/providers/gemini/credentials",
        headers=auth("viewer-a"),
        json={"api_key": "a-valid-looking-test-key"},
    )
    assert denied_secret_write.status_code == 403


def test_workspace_execution_api_does_not_disclose_other_tenant(monkeypatch, tmp_path):
    setup(monkeypatch, tmp_path)
    issuer = "https://issuer.example.test/"
    workspace_a = store.create_workspace(issuer, "owner-a", "Alpha")
    workspace_b = store.create_workspace(issuer, "owner-b", "Beta")
    execution = __import__("app.bridge.store", fromlist=["submit_workspace_execution"]).submit_workspace_execution(
        workspace_a["id"],
        "private-graph",
        {
            "graphId": "private-graph",
            "graph": {
                "schemaVersion": "1.0.0",
                "nodes": [{"id": "node-1"}],
                "edges": [],
            },
        },
        None,
    )

    response = client.get(
        f"/api/v1/workspaces/{workspace_b['id']}/bridge/executions/{execution['executionId']}",
        headers=auth("owner-b"),
    )
    assert response.status_code == 404

    own_response = client.get(
        f"/api/v1/workspaces/{workspace_a['id']}/bridge/executions/{execution['executionId']}",
        headers=auth("owner-a"),
    )
    assert own_response.status_code == 200
