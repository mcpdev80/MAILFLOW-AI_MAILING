"""DecisionMemory repository tests against real PostgreSQL."""

from __future__ import annotations

from uuid import uuid4

from app.models.email_account import EmailAccount
from app.models.organization import Organization
from app.repositories.decision_memory import DecisionMemoryRepository
from mailflow_core.types import ClassificationResult, ParsedEmail


def _classification(category: str = "finance") -> ClassificationResult:
    return ClassificationResult(
        label=category,
        confidence=1.0,
        method="decision_memory",
        category=category,
        importance="normal",
        urgency="none",
        action_required="no",
    )


async def _account(session, suffix: str) -> EmailAccount:
    org = Organization(name=f"Decision Memory {suffix}", slug=f"dm-{uuid4().hex[:8]}")
    session.add(org)
    await session.flush()
    account = EmailAccount(
        org_id=org.id,
        imap_host="imap.example.com",
        username=f"{suffix}@example.com",
        ownership_mode="shared",
    )
    session.add(account)
    await session.commit()
    return account


async def test_candidates_are_account_scoped(session) -> None:
    first = await _account(session, "first")
    second = await _account(session, "second")
    repo = DecisionMemoryRepository(session)
    await repo.create_entry(
        account_id=first.id,
        sender_email="billing@example.com",
        sender_domain="example.com",
        subject_pattern="Invoice 123",
        thread_id=None,
        classification=_classification(),
        routing_target=None,
        source="human_confirmed",
        trust_score=1.0,
    )
    await session.commit()

    email = ParsedEmail(
        uid=1,
        subject_normalized="Invoice 123",
        body_text="",
        body_html="",
        signature="",
        from_email="billing@example.com",
        from_domain="example.com",
    )
    assert len(await repo.candidates_for_email(first.id, email)) == 1
    assert await repo.candidates_for_email(second.id, email) == ()


async def test_new_human_correction_supersedes_conflicting_entry(session) -> None:
    account = await _account(session, "conflict")
    repo = DecisionMemoryRepository(session)
    old = await repo.create_entry(
        account_id=account.id,
        sender_email="billing@example.com",
        sender_domain="example.com",
        subject_pattern="Invoice",
        thread_id=None,
        classification=_classification("finance"),
        routing_target=None,
        source="human_confirmed",
        trust_score=1.0,
    )
    await session.commit()

    new = await repo.create_entry(
        account_id=account.id,
        sender_email="billing@example.com",
        sender_domain="example.com",
        subject_pattern="Invoice",
        thread_id=None,
        classification=_classification("work"),
        routing_target=None,
        source="human_corrected",
        trust_score=1.0,
    )
    await session.commit()
    await session.refresh(old)

    assert old.enabled is False
    assert old.superseded_by_id == new.id
    assert new.enabled is True


async def test_disabled_entries_are_not_candidates(session) -> None:
    account = await _account(session, "disabled")
    repo = DecisionMemoryRepository(session)
    entry = await repo.create_entry(
        account_id=account.id,
        sender_email="billing@example.com",
        sender_domain="example.com",
        subject_pattern="Invoice",
        thread_id=None,
        classification=_classification(),
        routing_target=None,
        source="human_confirmed",
        trust_score=1.0,
    )
    entry.enabled = False
    await session.commit()

    email = ParsedEmail(
        uid=1,
        subject_normalized="Invoice",
        body_text="",
        body_html="",
        signature="",
        from_email="billing@example.com",
        from_domain="example.com",
    )
    assert await repo.candidates_for_email(account.id, email) == ()
