"""Mailbox ownership and selective-sharing transition tests."""

from __future__ import annotations

import time
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select, text

from app.auth import RequestIdentity
from app.mailbox_access import get_accessible_account, get_account_for_management
from app.models.email_account import EmailAccount
from app.models.mailbox_access import MailboxAccess
from app.models.organization import Organization
from app.routers.accounts import change_mailbox_ownership
from app.schemas import MailboxOwnershipUpdate


@pytest.fixture()
async def ownership_context(session):
    suffix = uuid4().hex[:8]
    org = Organization(name="Ownership", slug=f"ownership-{suffix}", plan="free")
    session.add(org)
    await session.commit()
    await session.refresh(org)

    auth_org_id = f"ba-ownership-{suffix}"
    members = [
        ("owner-user", "member"),
        ("other-user", "member"),
        ("admin-user", "admin"),
    ]
    for index, (user_id, role) in enumerate(members):
        await session.execute(
            text(
                'INSERT INTO "member" ("id", "organizationId", "userId", role) '
                "VALUES (:id, :organization_id, :user_id, :role)"
            ),
            {
                "id": f"ownership-member-{suffix}-{index}",
                "organization_id": auth_org_id,
                "user_id": user_id,
                "role": role,
            },
        )
    await session.commit()

    def identity(user_id: str, role: str = "member") -> RequestIdentity:
        return RequestIdentity(
            org=org,
            user_id=user_id,
            auth_org_id=auth_org_id,
            role=role,
            auth_time=int(time.time()),
        )

    return org, identity


async def _private_account(session, org, owner_user_id: str) -> EmailAccount:
    account = EmailAccount(
        org_id=org.id,
        owner_user_id=owner_user_id,
        ownership_mode="private",
        imap_host="imap.example.com",
        username=f"{uuid4().hex[:8]}@example.com",
    )
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return account


async def test_private_owner_can_share_with_selected_user_only(
    session, ownership_context
):
    org, identity = ownership_context
    account = await _private_account(session, org, "owner-user")

    updated = await change_mailbox_ownership(
        account.id,
        MailboxOwnershipUpdate(mode="shared", shared_user_ids=["other-user"]),
        identity("owner-user"),
        session,
    )
    assert updated.ownership_mode == "shared"
    assert updated.owner_user_id is None

    grants = list(
        (
            await session.execute(
                select(MailboxAccess).where(MailboxAccess.account_id == account.id)
            )
        ).scalars()
    )
    by_user = {grant.user_id: grant for grant in grants}
    assert by_user["other-user"].can_use is True
    assert by_user["owner-user"].can_manage is True
    assert by_user["owner-user"].can_use is False

    visible = await get_accessible_account(account.id, identity("other-user"), session)
    assert visible.id == account.id

    with pytest.raises(HTTPException) as denied:
        await get_accessible_account(
            account.id,
            identity("admin-user", "admin"),
            session,
        )
    assert denied.value.status_code == 404


async def test_private_transfer_revokes_old_owner_access(session, ownership_context):
    org, identity = ownership_context
    account = await _private_account(session, org, "owner-user")

    updated = await change_mailbox_ownership(
        account.id,
        MailboxOwnershipUpdate(mode="private", target_owner_user_id="other-user"),
        identity("owner-user"),
        session,
    )
    assert updated.owner_user_id == "other-user"

    with pytest.raises(HTTPException) as old_owner:
        await get_accessible_account(account.id, identity("owner-user"), session)
    assert old_owner.value.status_code == 404

    new_owner = await get_accessible_account(account.id, identity("other-user"), session)
    assert new_owner.id == account.id


async def test_org_admin_cannot_take_over_resolved_private_mailbox(
    session, ownership_context
):
    org, identity = ownership_context
    account = await _private_account(session, org, "owner-user")

    with pytest.raises(HTTPException) as denied:
        await get_account_for_management(
            account.id,
            identity("admin-user", "admin"),
            session,
        )
    assert denied.value.status_code == 404


async def test_admin_can_resolve_unresolved_without_gaining_mail_access(
    session, ownership_context
):
    org, identity = ownership_context
    account = EmailAccount(
        org_id=org.id,
        owner_user_id=None,
        ownership_mode="unresolved",
        imap_host="imap.legacy.example.com",
        username=f"legacy-{uuid4().hex[:8]}@example.com",
    )
    session.add(account)
    await session.commit()
    await session.refresh(account)

    updated = await change_mailbox_ownership(
        account.id,
        MailboxOwnershipUpdate(mode="private", target_owner_user_id="other-user"),
        identity("admin-user", "admin"),
        session,
    )
    assert updated.ownership_mode == "private"
    assert updated.owner_user_id == "other-user"

    with pytest.raises(HTTPException) as admin_denied:
        await get_accessible_account(
            account.id,
            identity("admin-user", "admin"),
            session,
        )
    assert admin_denied.value.status_code == 404

    owner = await get_accessible_account(account.id, identity("other-user"), session)
    assert owner.id == account.id


async def test_shared_manager_can_make_mailbox_private_for_selected_member(
    session, ownership_context
):
    org, identity = ownership_context
    account = EmailAccount(
        org_id=org.id,
        owner_user_id=None,
        ownership_mode="shared",
        imap_host="imap.shared.example.com",
        username=f"shared-{uuid4().hex[:8]}@example.com",
    )
    session.add(account)
    await session.flush()
    session.add_all(
        [
            MailboxAccess(
                account_id=account.id,
                user_id="admin-user",
                can_use=False,
                can_manage=True,
            ),
            MailboxAccess(
                account_id=account.id,
                user_id="other-user",
                can_use=True,
                can_manage=False,
            ),
        ]
    )
    await session.commit()

    updated = await change_mailbox_ownership(
        account.id,
        MailboxOwnershipUpdate(mode="private", target_owner_user_id="other-user"),
        identity("admin-user", "admin"),
        session,
    )
    assert updated.ownership_mode == "private"
    assert updated.owner_user_id == "other-user"

    remaining_grants = list(
        (
            await session.execute(
                select(MailboxAccess).where(MailboxAccess.account_id == account.id)
            )
        ).scalars()
    )
    assert remaining_grants == []
