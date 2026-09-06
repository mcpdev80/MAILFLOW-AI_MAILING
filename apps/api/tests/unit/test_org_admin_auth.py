"""Role checks for privileged organization operations."""

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.auth import RequestIdentity, require_admin_role, require_org_admin
from app.config import settings
from app.models.organization import Organization


def identity(role: str | None, *, user_id: str | None = "user-1") -> RequestIdentity:
    org = Organization(name="Test", slug="test", plan="free")
    return RequestIdentity(org=org, user_id=user_id, role=role)


@pytest.mark.parametrize("role", ["owner", "admin"])
def test_owner_and_admin_are_allowed(role: str) -> None:
    require_admin_role(identity(role))


def test_member_is_forbidden() -> None:
    with pytest.raises(HTTPException) as exc:
        require_admin_role(identity("member"))
    assert exc.value.status_code == 403
    assert exc.value.detail == "organization_admin_required"


def test_single_tenant_identity_remains_allowed() -> None:
    require_admin_role(identity(None, user_id=None))


async def test_direct_multi_tenant_api_key_remains_privileged(monkeypatch) -> None:
    org = Organization(name="Test", slug="test", plan="free")
    request = Request(
        {"type": "http", "method": "POST", "path": "/llm-providers", "headers": []}
    )
    monkeypatch.setattr(settings, "AUTH_MODE", "multi")
    result = await require_org_admin(
        request,
        org,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    )
    assert result is org
