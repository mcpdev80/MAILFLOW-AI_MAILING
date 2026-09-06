"""Role checks for privileged organization operations."""

import pytest
from fastapi import HTTPException

from app.auth import RequestIdentity, require_org_admin
from app.models.organization import Organization


def identity(role: str | None, *, user_id: str | None = "user-1") -> RequestIdentity:
    org = Organization(name="Test", slug="test", plan="free")
    return RequestIdentity(org=org, user_id=user_id, role=role)


@pytest.mark.parametrize("role", ["owner", "admin"])
async def test_owner_and_admin_are_allowed(role: str) -> None:
    current = identity(role)
    assert await require_org_admin(current) is current.org


async def test_member_is_forbidden() -> None:
    with pytest.raises(HTTPException) as exc:
        await require_org_admin(identity("member"))
    assert exc.value.status_code == 403
    assert exc.value.detail == "organization_admin_required"


async def test_single_tenant_identity_remains_allowed() -> None:
    current = identity(None, user_id=None)
    assert await require_org_admin(current) is current.org
