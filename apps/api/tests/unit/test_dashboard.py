from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.auth import RequestIdentity
from app.models.audit_log import AuditLog
from app.models.email_account import EmailAccount
from app.models.mailbox_access import MailboxAccess
from app.models.organization import Organization
from app.models.processed_email import ProcessedEmail
from app.services.dashboard import build_dashboard, search_messages


async def _account(
    session,
    org: Organization,
    *,
    username: str,
    mode: str,
    owner: str | None = None,
) -> EmailAccount:
    account = EmailAccount(
        org_id=org.id,
        owner_user_id=owner,
        ownership_mode=mode,
        imap_host="imap.example.test",
        username=username,
        is_active=True,
    )
    session.add(account)
    await session.flush()
    return account


async def _message(
    session,
    account: EmailAccount,
    *,
    uid: int,
    subject: str,
    category: str = "work",
    urgency: str = "none",
    action_required: str = "no",
    review_required: bool = False,
    action_status: str = "execute",
    stage: int | None = 1,
    decision_memory: bool = False,
    processed_at: datetime | None = None,
) -> ProcessedEmail:
    cycle_id = uuid4()
    session.add(
        AuditLog(
            account_id=account.id,
            cycle_id=cycle_id,
            emails_processed=1,
            drafts_saved=0,
            error_count=0,
        )
    )
    row = ProcessedEmail(
        account_id=account.id,
        uid=uid,
        folder="INBOX",
        uidvalidity=1,
        from_email=f"sender{uid}@example.test",
        subject=subject,
        destination_folder="Archive",
        mailbox_action="move",
        mailbox_action_status=action_status,
        category=category,
        importance="high" if urgency == "today" else "normal",
        urgency=urgency,
        action_required=action_required,
        confidence=0.95,
        review_required=review_required,
        classification_stage=stage,
        decision_memory_id=uuid4() if decision_memory else None,
        method="test",
        draft_saved=False,
        cycle_id=cycle_id,
        processed_at=processed_at or datetime.now(UTC),
    )
    session.add(row)
    await session.flush()
    return row


@pytest.mark.asyncio
async def test_dashboard_aggregates_only_authorized_mailboxes(session) -> None:
    org = Organization(name="Dashboard", slug=f"dashboard-{uuid4()}", plan="free")
    session.add(org)
    await session.flush()

    own = await _account(
        session, org, username="own@example.test", mode="private", owner="user-a"
    )
    shared = await _account(session, org, username="shared@example.test", mode="shared")
    foreign = await _account(
        session, org, username="foreign@example.test", mode="private", owner="user-b"
    )
    session.add(
        MailboxAccess(
            account_id=shared.id,
            user_id="user-a",
            can_use=True,
            can_manage=False,
        )
    )

    now = datetime.now(UTC)
    await _message(
        session,
        own,
        uid=1,
        subject="Own urgent",
        category="finance",
        urgency="today",
        action_required="yes",
        review_required=True,
        decision_memory=True,
        processed_at=now,
    )
    await _message(
        session,
        shared,
        uid=2,
        subject="Shared deep",
        category="orders",
        stage=2,
        processed_at=now - timedelta(days=1),
    )
    await _message(
        session,
        foreign,
        uid=3,
        subject="FOREIGN SECRET",
        category="private",
        review_required=True,
        action_status="failed",
        processed_at=now,
    )
    await session.commit()

    identity = RequestIdentity(org=org, user_id="user-a")
    result = await build_dashboard(session, identity, range_days=7)

    assert result.counters.total_processed == 2
    assert result.counters.processed_range == 2
    assert result.counters.review_required == 1
    assert result.counters.urgent == 1
    assert result.counters.action_required == 1
    assert result.counters.failed_or_deferred == 0
    assert result.counters.decision_memory == 1
    assert result.counters.deep_model == 1
    assert {mailbox.label for mailbox in result.mailboxes} == {
        "own@example.test",
        "shared@example.test",
    }
    assert {item.key for item in result.categories} == {"finance", "orders"}


@pytest.mark.asyncio
async def test_search_filters_and_does_not_leak_private_mailbox(session) -> None:
    org = Organization(name="Search", slug=f"search-{uuid4()}", plan="free")
    session.add(org)
    await session.flush()

    own = await _account(
        session, org, username="own-search@example.test", mode="private", owner="user-a"
    )
    foreign = await _account(
        session,
        org,
        username="foreign-search@example.test",
        mode="private",
        owner="user-b",
    )
    await _message(
        session,
        own,
        uid=11,
        subject="Invoice September",
        category="finance",
        action_required="yes",
        decision_memory=True,
    )
    await _message(
        session,
        own,
        uid=12,
        subject="Team update",
        category="work",
        stage=2,
    )
    await _message(
        session,
        foreign,
        uid=13,
        subject="Invoice foreign private",
        category="finance",
        action_required="yes",
    )
    await session.commit()

    identity = RequestIdentity(org=org, user_id="user-a")
    result = await search_messages(
        session,
        identity,
        query="Invoice",
        category="finance",
        action_required="yes",
        classification_source="decision_memory",
    )

    assert result.total == 1
    assert len(result.items) == 1
    assert result.items[0].subject == "Invoice September"
    assert result.items[0].account_id == own.id
    assert result.items[0].classification_source == "decision_memory"

    hidden = await search_messages(session, identity, query="foreign private")
    assert hidden.total == 0
    assert hidden.items == []


@pytest.mark.asyncio
async def test_search_paginates_before_materializing_results(session) -> None:
    org = Organization(name="Large Search", slug=f"search-large-{uuid4()}", plan="free")
    session.add(org)
    await session.flush()
    account = await _account(
        session, org, username="large@example.test", mode="private", owner="user-a"
    )
    for uid in range(1, 31):
        await _message(
            session,
            account,
            uid=1000 + uid,
            subject=f"Bulk metadata {uid}",
            category="notifications",
        )
    await session.commit()

    result = await search_messages(
        session,
        RequestIdentity(org=org, user_id="user-a"),
        category="notifications",
        limit=10,
        offset=10,
    )

    assert result.total == 30
    assert result.limit == 10
    assert result.offset == 10
    assert len(result.items) == 10
