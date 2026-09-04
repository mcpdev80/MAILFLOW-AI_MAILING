"""Multi-tenant authentication and mailbox isolation tests.

These tests require Postgres through the existing test fixtures.
"""

from __future__ import annotations

import os
import time
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

os.environ.setdefault("SECRET_KEY", "qdCa5nGhLjd8qY0CCaQP2dE000lbSYDmtPnhzAVeVgs=")

ACTOR_SECRET = "test-internal-actor-secret"


@pytest.fixture()
async def multitenant(session, monkeypatch):
    from app import auth as auth_module
    from app.auth import generate_api_key, sign_actor_identity
    from app.config import settings
    from app.database import get_session
    from app.main import app
    from app.models.organization import Organization

    monkeypatch.setattr(settings, "AUTH_MODE", "multi")
    monkeypatch.setattr(settings, "INTERNAL_API_SECRET", ACTOR_SECRET)
    monkeypatch.setattr(auth_module.settings, "AUTH_MODE", "multi")
    monkeypatch.setattr(auth_module.settings, "INTERNAL_API_SECRET", ACTOR_SECRET)

    suffix = uuid.uuid4().hex[:8]
    raw_a, hash_a = generate_api_key()
    raw_b, hash_b = generate_api_key()
    org_a = Organization(
        name="A", slug=f"org-a-{suffix}", plan="free", api_key_hash=hash_a
    )
    org_b = Organization(
        name="B", slug=f"org-b-{suffix}", plan="free", api_key_hash=hash_b
    )
    session.add_all([org_a, org_b])
    await session.commit()
    await session.refresh(org_a)
    await session.refresh(org_b)

    auth_org_a = f"ba-org-a-{suffix}"
    auth_org_b = f"ba-org-b-{suffix}"
    await session.execute(
        text(
            'CREATE TABLE IF NOT EXISTS "member" ('
            '"id" text PRIMARY KEY, '
            '"organizationId" text NOT NULL, '
            '"userId" text NOT NULL, '
            '"role" text NOT NULL'
            ")"
        )
    )
    members = [
        (auth_org_a, "user-owner", "member"),
        (auth_org_a, "user-org-admin", "admin"),
        (auth_org_a, "user-a", "admin"),
        (auth_org_a, "user-b", "member"),
        (auth_org_a, "user-c", "member"),
        (auth_org_a, "real-user", "member"),
        (auth_org_b, "user-other-org", "admin"),
    ]
    for index, (auth_org_id, user_id, role) in enumerate(members):
        await session.execute(
            text(
                'INSERT INTO "member" ("id", "organizationId", "userId", role) '
                "VALUES (:id, :organization_id, :user_id, :role)"
            ),
            {
                "id": f"member-{suffix}-{index}",
                "organization_id": auth_org_id,
                "user_id": user_id,
                "role": role,
            },
        )
    await session.commit()

    def headers(
        raw_key: str,
        user_id: str,
        org_id,
        *,
        auth_org_id: str,
        role: str,
        method: str,
        path: str,
        timestamp: int | None = None,
        auth_time: int | None = None,
    ) -> dict[str, str]:
        ts = timestamp if timestamp is not None else int(time.time())
        authenticated_at = auth_time if auth_time is not None else int(time.time())
        signature = sign_actor_identity(
            ACTOR_SECRET,
            method=method,
            path=path,
            user_id=user_id,
            org_id=org_id,
            auth_org_id=auth_org_id,
            role=role,
            timestamp=ts,
            auth_time=authenticated_at,
        )
        return {
            "X-API-Key": raw_key,
            "X-MailFlow-Actor-User-Id": user_id,
            "X-MailFlow-Actor-Org-Id": str(org_id),
            "X-MailFlow-Actor-Auth-Org-Id": auth_org_id,
            "X-MailFlow-Actor-Role": role,
            "X-MailFlow-Actor-Auth-Time": str(authenticated_at),
            "X-MailFlow-Actor-Timestamp": str(ts),
            "X-MailFlow-Actor-Signature": signature,
        }

    async def _override():
        yield session

    app.dependency_overrides[get_session] = _override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, raw_a, raw_b, org_a, org_b, auth_org_a, auth_org_b, headers
    app.dependency_overrides.clear()


async def test_missing_key_is_401(multitenant):
    client, *_rest = multitenant
    resp = await client.get("/accounts")
    assert resp.status_code == 401


async def test_org_key_without_actor_is_401(multitenant):
    client, raw_a, *_rest = multitenant
    resp = await client.get("/accounts", headers={"X-API-Key": raw_a})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "actor_identity_required"


async def test_private_mailbox_is_visible_only_to_owner(multitenant):
    client, raw_a, _raw_b, org_a, _org_b, auth_org_a, _auth_org_b, headers = multitenant

    resp = await client.post(
        "/accounts",
        json={"imap_host": "a.example.com", "username": "a@x.com", "password": "p"},
        headers=headers(
            raw_a,
            "user-owner",
            org_a.id,
            auth_org_id=auth_org_a,
            role="member",
            method="POST",
            path="/accounts",
        ),
    )
    assert resp.status_code == 201, resp.text
    account = resp.json()
    assert account["ownership_mode"] == "private"
    assert account["owner_user_id"] == "user-owner"

    resp = await client.get(
        "/accounts",
        headers=headers(
            raw_a,
            "user-org-admin",
            org_a.id,
            auth_org_id=auth_org_a,
            role="admin",
            method="GET",
            path="/accounts",
        ),
    )
    assert resp.status_code == 200
    assert resp.json() == []

    path = f"/accounts/{account['id']}"
    resp = await client.get(
        path,
        headers=headers(
            raw_a,
            "user-org-admin",
            org_a.id,
            auth_org_id=auth_org_a,
            role="admin",
            method="GET",
            path=path,
        ),
    )
    assert resp.status_code == 404


async def test_member_cannot_create_shared_mailbox(multitenant):
    client, raw_a, _raw_b, org_a, _org_b, auth_org_a, _auth_org_b, headers = multitenant
    resp = await client.post(
        "/accounts",
        json={
            "imap_host": "shared.example.com",
            "username": "shared@x.com",
            "password": "p",
            "ownership_mode": "shared",
            "shared_user_ids": ["user-b"],
        },
        headers=headers(
            raw_a,
            "user-owner",
            org_a.id,
            auth_org_id=auth_org_a,
            role="member",
            method="POST",
            path="/accounts",
        ),
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "shared_mailbox_admin_required"


async def test_shared_mailbox_is_visible_only_to_selected_members(multitenant):
    client, raw_a, _raw_b, org_a, _org_b, auth_org_a, _auth_org_b, headers = multitenant
    resp = await client.post(
        "/accounts",
        json={
            "imap_host": "family.example.com",
            "username": "family@x.com",
            "password": "p",
            "ownership_mode": "shared",
            "shared_user_ids": ["user-b"],
        },
        headers=headers(
            raw_a,
            "user-a",
            org_a.id,
            auth_org_id=auth_org_a,
            role="admin",
            method="POST",
            path="/accounts",
        ),
    )
    assert resp.status_code == 201, resp.text
    account = resp.json()

    resp = await client.get(
        "/accounts",
        headers=headers(
            raw_a,
            "user-b",
            org_a.id,
            auth_org_id=auth_org_a,
            role="member",
            method="GET",
            path="/accounts",
        ),
    )
    assert account["id"] in {row["id"] for row in resp.json()}

    resp = await client.get(
        "/accounts",
        headers=headers(
            raw_a,
            "user-c",
            org_a.id,
            auth_org_id=auth_org_a,
            role="member",
            method="GET",
            path="/accounts",
        ),
    )
    assert account["id"] not in {row["id"] for row in resp.json()}

    resp = await client.get(
        "/accounts",
        headers=headers(
            raw_a,
            "user-a",
            org_a.id,
            auth_org_id=auth_org_a,
            role="admin",
            method="GET",
            path="/accounts",
        ),
    )
    assert account["id"] not in {row["id"] for row in resp.json()}

    access_path = f"/accounts/{account['id']}/access"
    resp = await client.get(
        access_path,
        headers=headers(
            raw_a,
            "user-a",
            org_a.id,
            auth_org_id=auth_org_a,
            role="admin",
            method="GET",
            path=access_path,
        ),
    )
    assert resp.status_code == 200
    access = {row["user_id"]: row for row in resp.json()}
    assert access["user-a"] == {
        "user_id": "user-a",
        "can_use": False,
        "can_manage": True,
    }
    assert access["user-b"]["can_use"] is True


async def test_shared_access_can_be_replaced_selectively(multitenant):
    client, raw_a, _raw_b, org_a, _org_b, auth_org_a, _auth_org_b, headers = multitenant
    create = await client.post(
        "/accounts",
        json={
            "imap_host": "family2.example.com",
            "username": "family2@x.com",
            "password": "p",
            "ownership_mode": "shared",
            "shared_user_ids": ["user-b"],
        },
        headers=headers(
            raw_a,
            "user-a",
            org_a.id,
            auth_org_id=auth_org_a,
            role="admin",
            method="POST",
            path="/accounts",
        ),
    )
    account_id = create.json()["id"]
    path = f"/accounts/{account_id}/access"
    resp = await client.put(
        path,
        json={"user_ids": ["user-c"]},
        headers=headers(
            raw_a,
            "user-a",
            org_a.id,
            auth_org_id=auth_org_a,
            role="admin",
            method="PUT",
            path=path,
        ),
    )
    assert resp.status_code == 200, resp.text

    for user_id, visible in [("user-b", False), ("user-c", True)]:
        resp = await client.get(
            "/accounts",
            headers=headers(
                raw_a,
                user_id,
                org_a.id,
                auth_org_id=auth_org_a,
                role="member",
                method="GET",
                path="/accounts",
            ),
        )
        ids = {row["id"] for row in resp.json()}
        assert (account_id in ids) is visible


async def test_shared_access_rejects_non_member(multitenant):
    client, raw_a, _raw_b, org_a, _org_b, auth_org_a, _auth_org_b, headers = multitenant
    resp = await client.post(
        "/accounts",
        json={
            "imap_host": "badshare.example.com",
            "username": "badshare@x.com",
            "password": "p",
            "ownership_mode": "shared",
            "shared_user_ids": ["not-a-member"],
        },
        headers=headers(
            raw_a,
            "user-a",
            org_a.id,
            auth_org_id=auth_org_a,
            role="admin",
            method="POST",
            path="/accounts",
        ),
    )
    assert resp.status_code == 422
    assert resp.json()["detail"] == "shared_user_not_organization_member"


async def test_org_cannot_see_another_orgs_accounts(multitenant):
    client, raw_a, raw_b, org_a, org_b, auth_org_a, auth_org_b, headers = multitenant
    resp = await client.post(
        "/accounts",
        json={"imap_host": "a.example.com", "username": "a2@x.com", "password": "p"},
        headers=headers(
            raw_a,
            "user-owner",
            org_a.id,
            auth_org_id=auth_org_a,
            role="member",
            method="POST",
            path="/accounts",
        ),
    )
    assert resp.status_code == 201, resp.text
    account_id = resp.json()["id"]

    resp = await client.get(
        "/accounts",
        headers=headers(
            raw_b,
            "user-other-org",
            org_b.id,
            auth_org_id=auth_org_b,
            role="admin",
            method="GET",
            path="/accounts",
        ),
    )
    assert resp.status_code == 200
    assert resp.json() == []

    path = f"/accounts/{account_id}"
    resp = await client.get(
        path,
        headers=headers(
            raw_b,
            "user-other-org",
            org_b.id,
            auth_org_id=auth_org_b,
            role="admin",
            method="GET",
            path=path,
        ),
    )
    assert resp.status_code == 404


async def test_forged_actor_role_is_rejected(multitenant):
    client, raw_a, _raw_b, org_a, _org_b, auth_org_a, _auth_org_b, headers = multitenant
    signed = headers(
        raw_a,
        "real-user",
        org_a.id,
        auth_org_id=auth_org_a,
        role="member",
        method="GET",
        path="/accounts",
    )
    signed["X-MailFlow-Actor-Role"] = "admin"
    resp = await client.get("/accounts", headers=signed)
    assert resp.status_code == 401
    assert resp.json()["detail"] == "invalid_actor_identity"


async def test_expired_actor_header_is_rejected(multitenant):
    client, raw_a, _raw_b, org_a, _org_b, auth_org_a, _auth_org_b, headers = multitenant
    signed = headers(
        raw_a,
        "user-a",
        org_a.id,
        auth_org_id=auth_org_a,
        role="admin",
        method="GET",
        path="/accounts",
        timestamp=int(time.time()) - 120,
    )
    resp = await client.get("/accounts", headers=signed)
    assert resp.status_code == 401
    assert resp.json()["detail"] == "actor_identity_expired"
