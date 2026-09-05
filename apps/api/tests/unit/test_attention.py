from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.attention_schemas import NotificationPreferenceView, ReviewCorrection
from app.auth import RequestIdentity
from app.models.attention import NotificationEvent, NotificationPreference
from app.models.audit_log import AuditLog
from app.models.decision_memory import DecisionMemoryEntry
from app.models.email_account import EmailAccount
from app.models.organization import Organization
from app.models.processed_email import ProcessedEmail
from app.services import attention


def _account(org_id, owner: str, username: str) -> EmailAccount:
    return EmailAccount(
        org_id=org_id,
        owner_user_id=owner,
        ownership_mode="private",
        imap_host="imap.example.test",
        username=username,
    )


def _message(account_id, cycle_id, *, uid: int, review: bool = False) -> ProcessedEmail:
    return ProcessedEmail(
        account_id=account_id,
        uid=uid,
        folder="INBOX",
        uidvalidity=1,
        message_id=f"<{uid}@example.test>",
        thread_id=f"thread-{uid}",
        from_email="sender@example.test",
        subject=f"Message {uid}",
        destination_folder="INBOX",
        mailbox_action="none",
        mailbox_action_status="none",
        category="work",
        importance="normal",
        urgency="none",
        action_required="no",
        confidence=0.95,
        review_required=review,
        method="llm",
        cycle_id=cycle_id,
    )


@pytest.mark.asyncio
async def test_review_visibility_dedupe_preferences_and_resolution(session):
    org = Organization(name="Attention test", slug=f"attention-{uuid4()}")
    session.add(org)
    await session.flush()

    account_a = _account(org.id, "user-a", "a@example.test")
    account_b = _account(org.id, "user-b", "b@example.test")
    session.add_all([account_a, account_b])
    await session.flush()

    cycle_a = uuid4()
    cycle_b = uuid4()
    session.add_all(
        [
            AuditLog(account_id=account_a.id, cycle_id=cycle_a),
            AuditLog(account_id=account_b.id, cycle_id=cycle_b),
        ]
    )
    await session.flush()

    visible = _message(account_a.id, cycle_a, uid=10, review=True)
    hidden = _message(account_b.id, cycle_b, uid=20, review=True)
    session.add_all([visible, hidden])
    await session.commit()

    identity = RequestIdentity(
        org=org,
        user_id="user-a",
        auth_org_id="auth-org",
        role="member",
    )

    inbox = await attention.list_review_items(session, identity)
    assert [item.id for item in inbox.items] == [visible.id]
    assert inbox.counters.review_needed == 1

    await attention.materialize_notifications(session, identity)
    await attention.materialize_notifications(session, identity)
    count = await session.scalar(
        select(func.count(NotificationEvent.id)).where(
            NotificationEvent.org_id == org.id,
            NotificationEvent.user_key == "user-a",
        )
    )
    assert count == 1

    prefs = NotificationPreferenceView(
        urgent_enabled=False,
        security_review_enabled=False,
        jobs_enabled=False,
        mailbox_health_enabled=False,
        daily_summary_enabled=False,
        daily_summary_hour=7,
        timezone="Europe/Berlin",
    )
    assert await attention.update_preferences(session, identity, prefs) == prefs
    stored = await session.scalar(
        select(NotificationPreference).where(
            NotificationPreference.org_id == org.id,
            NotificationPreference.user_key == "user-a",
        )
    )
    assert stored is not None
    assert stored.daily_summary_enabled is False
    assert stored.timezone == "Europe/Berlin"

    resolved = await attention.correct_review_item(
        session,
        identity,
        visible.id,
        ReviewCorrection(category="private", remember=True),
    )
    assert resolved is None

    memory = await session.scalar(
        select(DecisionMemoryEntry).where(
            DecisionMemoryEntry.account_id == account_a.id,
            DecisionMemoryEntry.source == "human_corrected",
        )
    )
    assert memory is not None
    assert memory.category == "private"
    assert memory.trust_score == 1.0

    event = await session.scalar(
        select(NotificationEvent).where(
            NotificationEvent.source_email_id == visible.id,
            NotificationEvent.user_key == "user-a",
        )
    )
    assert event is not None
    assert event.resolved_at is not None

    inbox_after = await attention.list_review_items(session, identity)
    assert inbox_after.items == []


@pytest.mark.asyncio
async def test_normal_high_confidence_mail_creates_no_review_noise(session):
    org = Organization(name="Attention quiet", slug=f"attention-quiet-{uuid4()}")
    session.add(org)
    await session.flush()
    account = _account(org.id, "quiet-user", "quiet@example.test")
    session.add(account)
    await session.flush()
    cycle_id = uuid4()
    session.add(AuditLog(account_id=account.id, cycle_id=cycle_id))
    await session.flush()
    session.add(_message(account.id, cycle_id, uid=30, review=False))
    await session.commit()

    identity = RequestIdentity(org=org, user_id="quiet-user", auth_org_id="auth-org", role="member")
    inbox = await attention.list_review_items(session, identity)
    assert inbox.items == []
    await attention.materialize_notifications(session, identity)
    count = await session.scalar(
        select(func.count(NotificationEvent.id)).where(
            NotificationEvent.user_key == "quiet-user"
        )
    )
    assert count == 0
