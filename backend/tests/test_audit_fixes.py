import sqlite3

import pytest

from app.bridge import asset_store
from app.config import get_settings
from app.tenancy import store


@pytest.fixture()
def tenancy_db(tmp_path, monkeypatch):
    monkeypatch.setenv("PIECS_DATABASE_PATH", str(tmp_path / "tenancy.sqlite3"))
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _workspace_with_admin():
    workspace = store.create_workspace("iss", "owner", "Workspace")
    store.add_member("iss", "owner", workspace["id"], "iss", "admin1", "admin")
    return workspace["id"]


def test_admin_cannot_demote_owner_via_add_member(tenancy_db):
    workspace_id = _workspace_with_admin()
    with pytest.raises(ValueError):
        store.add_member("iss", "admin1", workspace_id, "iss", "owner", "viewer")
    assert store.get_membership("iss", "owner", workspace_id)["role"] == "owner"


def test_add_member_does_not_reactivate_suspended_member(tenancy_db):
    workspace_id = _workspace_with_admin()
    store.add_member("iss", "owner", workspace_id, "iss", "bob", "member")
    with sqlite3.connect(get_settings().database_path) as db:
        db.execute("UPDATE workspace_memberships SET status='suspended' WHERE user_id=(SELECT id FROM tenant_users WHERE subject='bob')")
    with pytest.raises(ValueError):
        store.add_member("iss", "admin1", workspace_id, "iss", "bob", "admin")
    assert store.get_membership("iss", "bob", workspace_id)["status"] == "suspended"


def test_add_member_can_still_update_active_member_role(tenancy_db):
    workspace_id = _workspace_with_admin()
    store.add_member("iss", "owner", workspace_id, "iss", "bob", "viewer")
    store.add_member("iss", "admin1", workspace_id, "iss", "bob", "member")
    assert store.get_membership("iss", "bob", workspace_id)["role"] == "member"


@pytest.mark.parametrize("asset_id", ["../other/asset", "a/b", "..", "a..b", "%2e%2e/x", "", " x", "x" * 129])
def test_asset_store_rejects_unsafe_asset_ids(asset_id):
    with pytest.raises(ValueError):
        asset_store.get_image(asset_id, "workspace-1")
    with pytest.raises(ValueError):
        asset_store.put_image(asset_id, b"data", "image/png", "workspace-1")


def test_asset_store_accepts_generated_asset_id_format():
    assert asset_store._validate_asset_id("1760000000000-0123456789abcdef01234567")
