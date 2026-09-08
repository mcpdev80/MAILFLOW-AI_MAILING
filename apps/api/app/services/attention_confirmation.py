"""Explicit human confirmation for review items.

The generic correction path historically only resolved a review when a field changed.
Confirming the proposed classification therefore left low-confidence items in the
review inbox forever. This wrapper gives an explicit confirmation semantic without
changing routing/security review behavior.
"""

from __future__ import annotations

from uuid import UUID

from mailflow_core.types import ClassificationResult
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.attention_schemas import ReviewCorrection, ReviewItem
from app.auth import RequestIdentity
from app.mailbox_access import get_accessible_account
from app.models.processed_email import ProcessedEmail
from app.repositories.decision_memory import DecisionMemoryRepository
from app.services.attention import _review_item, correct_review_item
from app.services.attention_visibility import message_requires_review


async def correct_or_confirm_review_item(
    session: AsyncSession,
    identity: RequestIdentity,
    item_id: UUID,
    payload: ReviewCorrection,
) -> ReviewItem | None:
    """Apply a correction and explicitly resolve classification review when confirmed."""
    result = await correct_review_item(session, identity, item_id, payload)
    if not payload.confirm:
        return result

    row = await session.scalar(
        select(ProcessedEmail).where(ProcessedEmail.id == item_id)
    )
    if row is None:
        return None
    account = await get_accessible_account(row.account_id, identity, session)

    # A human confirmation supersedes model uncertainty. Security flags and
    # routing reviews are deliberately independent and are not cleared here.
    # Urgency/action-required stay intact as attention signals, but no longer
    # keep the message in Review after the classification has been confirmed.
    row.review_required = False
    row.needs_more_context = False
    row.confidence = 1.0

    if payload.remember and row.decision_memory_id is None:
        classification = ClassificationResult(
            label=row.category,
            category=row.category,
            subcategory=row.subcategory,
            importance=row.importance,
            urgency=row.urgency,
            action_required=row.action_required,
            system_tags=tuple(row.system_tags or ()),
            user_tags=tuple(row.user_tags or ()),
            confidence=1.0,
            method="fallback",
            review_required=False,
        )
        sender = row.from_email.strip().lower()
        domain = sender.rsplit("@", 1)[1] if "@" in sender else None
        memory = await DecisionMemoryRepository(session).create_entry(
            account_id=row.account_id,
            sender_email=sender or None,
            sender_domain=domain,
            subject_pattern=None,
            thread_id=row.thread_id,
            classification=classification,
            routing_target=row.destination_folder,
            source="human_confirmed",
            trust_score=1.0,
        )
        row.decision_memory_id = memory.id
        row.decision_memory_match_confidence = 1.0
        row.decision_memory_hint_used = False

    await session.commit()
    if not message_requires_review(row):
        return None
    return _review_item(row, account)
