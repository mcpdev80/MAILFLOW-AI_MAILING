"""Per-user-facing attention suppression without mutating classification semantics."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.attention_schemas import AttentionCounters, DailySummary
from app.auth import RequestIdentity
from app.mailbox_access import access_condition, get_accessible_account
from app.models.attention import NotificationEvent
from app.models.email_account import EmailAccount
from app.models.processed_email import ProcessedEmail

_SINGLE_USER_KEY = "__single__"


def _actor_key(identity: RequestIdentity) -> str:
    return identity.user_id or _SINGLE_USER_KEY


def _failure(row: ProcessedEmail) -> bool:
    return row.mailbox_action_status in {"blocked", "failed", "error"}


def _review(row: ProcessedEmail) -> bool:
    return bool(
        row.suspicious_content
        or row.review_required
        or row.action_review_required
        or row.needs_more_context
        or row.confidence < 0.75
        or row.urgency in {"immediate", "today"}
        or row.action_required == "yes"
        or _failure(row)
    )


async def active_message_rows(
    session: AsyncSession, identity: RequestIdentity
) -> list[ProcessedEmail]:
    rows = await session.execute(
        select(ProcessedEmail)
        .join(EmailAccount, EmailAccount.id == ProcessedEmail.account_id)
        .where(
            access_condition(identity),
            ProcessedEmail.attention_dismissed_at.is_(None),
        )
    )
    return list(rows.scalars())


async def active_counters(
    session: AsyncSession,
    identity: RequestIdentity,
    *,
    unread_notifications: int = 0,
) -> AttentionCounters:
    rows = await active_message_rows(session, identity)
    return AttentionCounters(
        urgent=sum(1 for row in rows if row.urgency in {"immediate", "today"}),
        action_required=sum(1 for row in rows if row.action_required == "yes"),
        review_needed=sum(1 for row in rows if _review(row)),
        failures=sum(1 for row in rows if _failure(row)),
        security=sum(1 for row in rows if row.suspicious_content),
        unread_notifications=unread_notifications,
    )


async def dismissed_message_ids(
    session: AsyncSession, identity: RequestIdentity
) -> set[UUID]:
    rows = await session.execute(
        select(ProcessedEmail.id)
        .join(EmailAccount, EmailAccount.id == ProcessedEmail.account_id)
        .where(
            access_condition(identity),
            ProcessedEmail.attention_dismissed_at.is_not(None),
        )
    )
    return set(rows.scalars())


async def dismiss_message_review(
    session: AsyncSession,
    identity: RequestIdentity,
    item_id: UUID,
) -> bool:
    row = await session.scalar(select(ProcessedEmail).where(ProcessedEmail.id == item_id))
    if row is None:
        return False
    await get_accessible_account(row.account_id, identity, session)
    now = datetime.now(tz=UTC)
    row.attention_dismissed_at = now
    events = list(
        (
            await session.execute(
                select(NotificationEvent).where(
                    NotificationEvent.org_id == identity.org.id,
                    NotificationEvent.user_key == _actor_key(identity),
                    NotificationEvent.source_email_id == row.id,
                    NotificationEvent.resolved_at.is_(None),
                )
            )
        ).scalars()
    )
    for event in events:
        event.resolved_at = now
    await session.commit()
    return True


async def filter_daily_summary(
    session: AsyncSession,
    identity: RequestIdentity,
    summary: DailySummary,
) -> DailySummary:
    dismissed = await dismissed_message_ids(session, identity)
    if dismissed:
        summary.urgent = [item for item in summary.urgent if item.message_id not in dismissed]
        summary.action_required = [
            item for item in summary.action_required if item.message_id not in dismissed
        ]
        summary.awaiting_review = [
            item for item in summary.awaiting_review if item.message_id not in dismissed
        ]
        summary.failures = [
            item for item in summary.failures if item.message_id not in dismissed
        ]
    summary.counters = await active_counters(session, identity)
    return summary
