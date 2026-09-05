"""Compose the unified review inbox from message and operational state."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.attention_schemas import ReviewInbox
from app.auth import RequestIdentity
from app.services.attention import list_review_items
from app.services.attention_operational import list_operational_review_items


async def build_review_inbox(
    session: AsyncSession,
    identity: RequestIdentity,
    *,
    account_id: UUID | None = None,
    category: str | None = None,
    urgency: str | None = None,
    importance: str | None = None,
    reason: str | None = None,
    ownership_mode: str | None = None,
    limit: int = 100,
) -> ReviewInbox:
    message_review = await list_review_items(
        session,
        identity,
        account_id=account_id,
        category=category,
        urgency=urgency,
        importance=importance,
        reason=reason,
        ownership_mode=ownership_mode,
        limit=limit,
    )
    operational = await list_operational_review_items(session, identity)
    if account_id is not None:
        operational = [item for item in operational if item.account_id == account_id]
    if ownership_mode:
        operational = [
            item for item in operational if item.ownership_mode == ownership_mode
        ]
    if reason:
        operational = [item for item in operational if item.source_type == reason]
    if category or urgency or importance:
        operational = []

    operational = operational[:limit]
    message_review.operational = operational
    message_review.counters.review_needed += len(operational)
    message_review.counters.failures += sum(
        1 for item in operational if item.status == "failed"
    )
    return message_review
