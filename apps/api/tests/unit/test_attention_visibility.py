from __future__ import annotations

from uuid import uuid4

import pytest

from app.auth import RequestIdentity
from app.models.audit_log import AuditLog
from app.models.email_account import EmailAccount
from app.models.organization import Organization
from app.models.processed_email import ProcessedEmail
from app.services import attention
from app.services.attention_review import build_review_inbox
from app.services.attention_visibility import (
    dismiss_message_review,
    filter_daily_summary,
)


@pytest.mark.asyncio
async def test_dismiss_suppresses_attention_without_rewriting_classification(session):
    org = Organization(name="Dismiss test", slug=f"dismiss-{uuid4()}")
    session.add(org)
    await session.flush()
    account = EmailAccount(
        org_id=org.id,
        owner_user_id="dismiss-user",
        ownership_mode="private",
        imap_host="imap.example.test",
        username="dismiss@example.test",
    )
    session.add(account)
    await session.flush()
    cycle_id = uuid4()
    session.add(AuditLog(account_id=account.id, cycle_id=cycle_id))
    await session.flush()
    message = ProcessedEmail(
        account_id=account.id,
        uid=99,
        folder="INBOX",
        uidvalidity=1,
        message_id="<dismiss@example.test>",
        thread_id="dismiss-thread",
        from_email="sender@example.test",
        subject="Urgent contract question",
        destination_folder="INBOX",
        mailbox_action="none",
        mailbox_action_status="none",
        category="work",
        importance="critical",
        urgency="immediate",
        action_required="yes",
        confidence=0.4,
        review_required=True,
        suspicious_content=True,
        method="llm",
        cycle_id=cycle_id,
    )
    session.add(message)
    await session.commit()

    identity = RequestIdentity(
        org=org,
        user_id="dismiss-user",
        auth_org_id="auth-org",
        role="member",
    )

    await attention.materialize_notifications(session, identity)
    before = await attention.list_notifications(session, identity)
    assert before.notifications

    assert await dismiss_message_review(session, identity, message.id) is True
    await session.refresh(message)
    assert message.attention_dismissed_at is not None
    assert message.importance == "critical"
    assert message.urgency == "immediate"
    assert message.action_required == "yes"
    assert message.suspicious_content is True

    review = await build_review_inbox(session, identity)
    assert review.items == []
    assert review.counters.review_needed == 0
    assert review.counters.urgent == 0
    assert review.counters.action_required == 0
    assert review.counters.security == 0

    notifications = await attention.list_notifications(session, identity)
    assert notifications.notifications == []

    raw_summary = await attention.build_daily_summary(session, identity, hours=24)
    summary = await filter_daily_summary(session, identity, raw_summary)
    assert summary.urgent == []
    assert summary.action_required == []
    assert summary.awaiting_review == []
    assert summary.important_new == []
    assert summary.counters.review_needed == 0
