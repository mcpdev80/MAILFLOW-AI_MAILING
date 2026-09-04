"""Mailbox lifecycle, user removal and retention safety tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import select

from app.lifecycle import (
    delete_mailbox_local_state,
    disable_mailbox,
    disconnect_mailbox,
    finalize_removed_member,
    prepare_user_removal,
    purge_expired_lifecycle_events,
)
from app.models.email_account import EmailAccount
from app.models.lifecycle_event import LifecycleEvent
from app.models.mailbox_access import MailboxAccess
from app.models.organization import Organization
from app.repositories.account import AccountRepository


async def _org(session) -> Organization:
    org = Organization(name="Lifecycle", slug=f"lifecycle-{uuid4().hex[:8]}", plan="free")
    session.add(org)
    await session.commit()
    await session.refresh(org)
    return org


async def _account(session, org: Organization, *, owner: str = "owner") -> EmailAccount:
    account = EmailAccount(
        org_id=org.id,
        owner_user_id=owner,
        ownership_mode="private",
        imap_host="imap.example.com",
        username=f"{uuid4().hex[:8]}@example.com",
        encrypted_credentials="encrypted-password",
        encrypted_oauth="encrypted-oauth",
        is_active=True,
    )
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return account


async def test_disable_fences_processing_without_removing_credentials(session):
    org = await _org(session)
    account = await _account(session, org)

    await disable_mailbox(session, account, actor_user_id="owner")
    await session.commit()

    assert account.is_active is False
    assert account.encrypted_credentials == "encrypted-password"
    assert account.encrypted_oauth == "encrypted-oauth"
    assert await AccountRepository(session).is_processing_allowed(account.id) is False


async def test_disconnect_removes_local_credentials_but_keeps_account(session):
    org = await _org(session)
    account = await _account(session, org)

    await disconnect_mailbox(session, account, actor_user_id="owner")
    await session.commit()

    restored = await session.get(EmailAccount, account.id)
    assert restored is not None
    assert restored.is_active is False
    assert restored.encrypted_credentials is None
    assert restored.encrypted_oauth is None


async def test_delete_local_state_keeps_one_compact_tombstone(session):
    org = await _org(session)
    account = await _account(session, org)
    account_id = account.id

    await delete_mailbox_local_state(session, account, actor_user_id="owner")
    await session.commit()

    assert await session.get(EmailAccount, account_id) is None
    events = list(
        (
            await session.execute(
                select(LifecycleEvent).where(LifecycleEvent.account_id == account_id)
            )
        ).scalars()
    )
    assert [event.event for event in events] == ["mailbox_deleted"]


async def test_user_removal_disable_never_orphans_private_owner(session):
    org = await _org(session)
    account = await _account(session, org, owner="leaving-user")
    shared = EmailAccount(
        org_id=org.id,
        owner_user_id=None,
        ownership_mode="shared",
        imap_host="imap.shared.example.com",
        username="shared@example.com",
    )
    session.add(shared)
    await session.flush()
    session.add(
        MailboxAccess(
            account_id=shared.id,
            user_id="leaving-user",
            can_use=True,
            can_manage=False,
        )
    )
    await session.commit()

    count = await prepare_user_removal(
        session,
        org_id=org.id,
        user_id="leaving-user",
        action="disable",
        actor_user_id="admin-user",
    )
    await session.commit()

    await session.refresh(account)
    assert count == 1
    assert account.is_active is False
    assert account.ownership_mode == "unresolved"
    assert account.owner_user_id is None
    grant = (
        await session.execute(
            select(MailboxAccess).where(MailboxAccess.user_id == "leaving-user")
        )
    ).scalar_one_or_none()
    assert grant is None


async def test_finalize_member_removal_rejects_unresolved_private_ownership(session):
    org = await _org(session)
    await _account(session, org, owner="leaving-user")

    try:
        await finalize_removed_member(session, org_id=org.id, user_id="leaving-user")
    except RuntimeError as exc:
        assert str(exc) == "private_mailboxes_require_resolution"
    else:
        raise AssertionError("member removal must fail while private mailboxes are owned")


async def test_lifecycle_retention_cleanup_is_bounded(session):
    org = await _org(session)
    old_time = datetime.now(tz=UTC) - timedelta(days=365)
    session.add_all(
        [
            LifecycleEvent(
                org_id=org.id,
                actor_user_id="admin",
                event=f"old-{index}",
                created_at=old_time,
            )
            for index in range(3)
        ]
    )
    await session.commit()

    deleted = await purge_expired_lifecycle_events(
        session,
        retention_days=180,
        batch_size=2,
    )
    await session.commit()

    assert deleted == 2
    remaining = list(
        (
            await session.execute(
                select(LifecycleEvent).where(LifecycleEvent.org_id == org.id)
            )
        ).scalars()
    )
    assert len(remaining) == 1
