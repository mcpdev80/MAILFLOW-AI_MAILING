"""Shared helpers for dashboard and metadata search services."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity
from app.mailbox_access import access_condition
from app.models.email_account import EmailAccount
from app.models.processed_email import ProcessedEmail

FAILED_STATES = ("blocked", "failed", "error", "deferred")
PENDING_STATES = ("review", "pending", "queued", "deferred")
AUTOMATED_ACTIONS = ("move", "archive", "tag")
ACTIVE_BACKFILL_STATES = ("running", "paused")


def classification_source(row: ProcessedEmail) -> str:
    if row.decision_memory_id is not None:
        return "decision_memory"
    if row.classification_stage is not None and row.classification_stage >= 2:
        return "deep_model"
    return "fast_model"


async def accessible_accounts(
    session: AsyncSession, identity: RequestIdentity
) -> list[EmailAccount]:
    rows = await session.execute(
        select(EmailAccount)
        .where(access_condition(identity))
        .order_by(EmailAccount.username.asc())
    )
    return list(rows.scalars())
