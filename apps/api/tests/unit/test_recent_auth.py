"""Recent-authentication tests for sensitive multi-user API actions."""

from __future__ import annotations

import time
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.auth import RequestIdentity, require_recent_auth, sign_actor_identity
from app.models.organization import Organization


def _identity(*, auth_time: int | None) -> RequestIdentity:
    org = Organization(id=uuid4(), name="Test", slug=f"test-{uuid4().hex}", plan="free")
    return RequestIdentity(
        org=org,
        user_id="user-1",
        auth_org_id="better-auth-org",
        role="admin",
        auth_time=auth_time,
    )


def test_recent_auth_accepts_fresh_session():
    require_recent_auth(_identity(auth_time=int(time.time()) - 30))


def test_recent_auth_rejects_stale_session():
    with pytest.raises(HTTPException) as exc:
        require_recent_auth(_identity(auth_time=int(time.time()) - 900))
    assert exc.value.status_code == 403
    assert exc.value.detail == "recent_auth_required"


def test_recent_auth_rejects_missing_signed_auth_time():
    with pytest.raises(HTTPException) as exc:
        require_recent_auth(_identity(auth_time=None))
    assert exc.value.status_code == 401
    assert exc.value.detail == "recent_auth_required"


def test_single_tenant_identity_does_not_require_human_recent_auth():
    org = Organization(id=uuid4(), name="Single", slug=f"single-{uuid4().hex}", plan="free")
    require_recent_auth(RequestIdentity(org=org, user_id=None))


def test_actor_signature_binds_authentication_time():
    kwargs = {
        "method": "PUT",
        "path": "/accounts/abc/ownership",
        "user_id": "user-1",
        "org_id": uuid4(),
        "auth_org_id": "better-auth-org",
        "role": "admin",
        "timestamp": int(time.time()),
    }
    first = sign_actor_identity("secret", auth_time=100, **kwargs)
    second = sign_actor_identity("secret", auth_time=101, **kwargs)
    assert first != second
