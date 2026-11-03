import sqlite3

import pytest
from pydantic import ValidationError

from app.bridge import asset_store
from app.config import get_settings
from app.tenancy import store
from app.tenancy.routes import WorkspaceInput


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


def _suspend(subject):
    with sqlite3.connect(get_settings().database_path) as db:
        db.execute(
            "UPDATE workspace_memberships SET status='suspended' "
            "WHERE user_id=(SELECT id FROM tenant_users WHERE subject=?)",
            (subject,),
        )


def test_admin_cannot_demote_owner_via_add_member(tenancy_db):
    workspace_id = _workspace_with_admin()
    with pytest.raises(ValueError):
        store.add_member("iss", "admin1", workspace_id, "iss", "owner", "viewer")
    assert store.get_membership("iss", "owner", workspace_id)["role"] == "owner"


def test_add_member_owner_raises_owner_protected_error(tenancy_db):
    workspace_id = _workspace_with_admin()
    with pytest.raises(store.OwnerProtectedError):
        store.add_member("iss", "admin1", workspace_id, "iss", "owner", "viewer")


def test_add_member_does_not_reactivate_suspended_member(tenancy_db):
    workspace_id = _workspace_with_admin()
    store.add_member("iss", "owner", workspace_id, "iss", "bob", "member")
    _suspend("bob")
    with pytest.raises(store.MemberSuspendedError):
        store.add_member("iss", "admin1", workspace_id, "iss", "bob", "admin")
    assert store.get_membership("iss", "bob", workspace_id)["status"] == "suspended"


def test_add_member_can_still_update_active_member_role(tenancy_db):
    workspace_id = _workspace_with_admin()
    store.add_member("iss", "owner", workspace_id, "iss", "bob", "viewer")
    store.add_member("iss", "admin1", workspace_id, "iss", "bob", "member")
    assert store.get_membership("iss", "bob", workspace_id)["role"] == "member"


def test_change_member_role_rejects_owner_target(tenancy_db):
    workspace_id = _workspace_with_admin()
    with pytest.raises(store.OwnerProtectedError):
        store.change_member_role("iss", "owner", workspace_id, "iss", "owner", "viewer")


def test_remove_member_rejects_owner_target(tenancy_db):
    workspace_id = _workspace_with_admin()
    with pytest.raises(store.OwnerProtectedError):
        store.remove_member("iss", "owner", workspace_id, "iss", "owner")


def test_workspace_name_is_stripped_and_validated():
    assert WorkspaceInput(name="  My Space  ").name == "My Space"
    with pytest.raises(ValidationError):
        WorkspaceInput(name="    ")
    with pytest.raises(ValidationError):
        WorkspaceInput(name="x" * 81)


@pytest.mark.parametrize("asset_id", ["../other/asset", "a/b", "..", "a..b", "%2e%2e/x", "", " x", "x" * 129])
def test_asset_store_rejects_unsafe_asset_ids(asset_id):
    with pytest.raises(ValueError):
        asset_store.get_image(asset_id, "workspace-1")
    with pytest.raises(ValueError):
        asset_store.put_image(asset_id, b"data", "image/png", "workspace-1")


def test_asset_store_accepts_generated_asset_id_format():
    assert asset_store._validate_asset_id("1760000000000-0123456789abcdef01234567")
