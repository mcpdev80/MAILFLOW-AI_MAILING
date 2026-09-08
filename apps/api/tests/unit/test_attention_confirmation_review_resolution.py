from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select

from app.attention_schemas import ReviewCorrection
from app.auth import RequestIdentity
from app.models.audit_log import AuditLog
from app.models.decision_memory import DecisionMemoryEntry
from app.models.email_account import EmailAccount
from app.models.organization import Organization
from app.models.processed_email import ProcessedEmail
from app.services.attention_confirmation import correct_or_confirm_review_item
from app.services.attention_review import build_review_inbox


@pytest.mark.asyncio
async def test_confirmed_urgent_action_is_saved_but_removed_from_review(session):
    org = Organization(name="Confirm review", slug=f"confirm-review-{uuid4()}")
    session.add(org)
    await session.flush()

    account = EmailAccount(
        org_id=org.id,
        owner_user_id="user-a",
        ownership_mode="private",
        imap_host="imap.example.test",
        username="admin@example.test",
    )
    session.add(account)
    await session.flush()

    cycle_id = uuid4()
    session.add(AuditLog(account_id=account.id, cycle_id=cycle_id))
    await session.flush()

    message = ProcessedEmail(
        account_id=account.id,
        uid=81,
        folder="INBOX",
        uidvalidity=1,
        message_id="<81@example.test>",
        thread_id="thread-81",
        from_email="verify@service.example.test",
        subject="Verification code",
        destination_folder="Notifications",
        mailbox_action="none",
        mailbox_action_status="none",
        category="notifications",
        subcategory="verification",
        importance="critical",
        urgency="immediate",
        action_required="yes",
        confidence=1.0,
        review_required=True,
        needs_more_context=False,
        method="llm",
        cycle_id=cycle_id,
    )
    session.add(message)
    await session.commit()

    identity = RequestIdentity(
        org=org,
        user_id="user-a",
        auth_org_id="auth-org",
        role="member",
    )

    before = await build_review_inbox(session, identity)
    assert [item.id for item in before.items] == [message.id]
    assert before.counters.review_needed == 1
    assert before.counters.urgent == 1
    assert before.counters.action_required == 1

    result = await correct_or_confirm_review_item(
        session,
        identity,
        message.id,
        ReviewCorrection(confirm=True, remember=True),
    )
    assert result is None

    refreshed = await session.get(ProcessedEmail, message.id)
    assert refreshed is not None
    assert refreshed.review_required is False
    assert refreshed.confidence == 1.0
    assert refreshed.urgency == "immediate"
    assert refreshed.action_required == "yes"
    assert refreshed.decision_memory_id is not None

    memory = await session.scalar(
        select(DecisionMemoryEntry).where(
            DecisionMemoryEntry.id == refreshed.decision_memory_id,
            DecisionMemoryEntry.source == "human_confirmed",
        )
    )
    assert memory is not None
    assert memory.category == "notifications"
    assert memory.subcategory == "verification"
    assert memory.trust_score == 1.0

    after = await build_review_inbox(session, identity)
    assert after.items == []
    assert after.counters.review_needed == 0
    assert after.counters.urgent == 1
    assert after.counters.action_required == 1
