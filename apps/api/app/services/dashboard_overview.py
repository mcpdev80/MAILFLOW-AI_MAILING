"""Authorization-scoped operational dashboard aggregates."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import String, and_, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity
from app.dashboard_schemas import (
    DashboardBreakdownItem,
    DashboardCounters,
    DashboardMailboxStatus,
    DashboardOverview,
    DashboardTrendPoint,
)
from app.inference_health import read_inference_health
from app.models.backfill import BackfillJob
from app.models.email_account import EmailAccount
from app.models.processed_email import ProcessedEmail
from app.services.dashboard_common import (
    ACTIVE_BACKFILL_STATES,
    AUTOMATED_ACTIONS,
    FAILED_STATES,
    PENDING_STATES,
    accessible_accounts,
)


def _time_window(range_days: int) -> tuple[datetime, datetime, datetime]:
    now = datetime.now(UTC)
    today_start = datetime.combine(now.date(), datetime.min.time(), tzinfo=UTC)
    range_start = today_start - timedelta(days=max(range_days - 1, 0))
    return now, today_start, range_start


def _count(label: str, predicate=None):
    value = func.count(ProcessedEmail.id)
    if predicate is not None:
        value = value.filter(predicate)
    return value.label(label)


def _counter_columns(range_start: datetime, today_start: datetime):
    no_memory = ProcessedEmail.decision_memory_id.is_(None)
    pending = or_(
        ProcessedEmail.action_review_required.is_(True),
        ProcessedEmail.mailbox_action_status.in_(PENDING_STATES),
    )
    automated = and_(
        ProcessedEmail.mailbox_action.in_(AUTOMATED_ACTIONS),
        ProcessedEmail.mailbox_action_status == "execute",
    )
    fast = and_(
        no_memory,
        or_(
            ProcessedEmail.classification_stage.is_(None),
            ProcessedEmail.classification_stage <= 1,
        ),
    )
    deep = and_(no_memory, ProcessedEmail.classification_stage >= 2)
    return (
        _count("total_processed"),
        _count("processed_range", ProcessedEmail.processed_at >= range_start),
        _count("processed_today", ProcessedEmail.processed_at >= today_start),
        _count("pending_or_queued", pending),
        _count("review_required", ProcessedEmail.review_required.is_(True)),
        _count("urgent", ProcessedEmail.urgency.in_(("immediate", "today"))),
        _count("action_required", ProcessedEmail.action_required == "yes"),
        _count(
            "failed_or_deferred",
            ProcessedEmail.mailbox_action_status.in_(FAILED_STATES),
        ),
        _count("automated_actions", automated),
        _count("decision_memory", ProcessedEmail.decision_memory_id.is_not(None)),
        _count("fast_model", fast),
        _count("deep_model", deep),
    )


async def _counter_row(session: AsyncSession, scope, range_start, today_start):
    query = select(*_counter_columns(range_start, today_start)).where(scope)
    return (await session.execute(query)).one()


async def _build_counters(
    session: AsyncSession, scope, account_ids: list[UUID], range_start, today_start
) -> DashboardCounters:
    row = await _counter_row(session, scope, range_start, today_start)
    active_backfills = int(
        await session.scalar(
            select(func.count(BackfillJob.id)).where(
                BackfillJob.account_id.in_(account_ids),
                BackfillJob.state.in_(ACTIVE_BACKFILL_STATES),
            )
        )
        or 0
    )
    values = {
        key: int(getattr(row, key) or 0)
        for key in DashboardCounters.model_fields
        if key != "active_backfills"
    }
    return DashboardCounters(**values, active_backfills=active_backfills)


async def _build_trend(
    session: AsyncSession, scope, range_start: datetime, range_days: int
) -> list[DashboardTrendPoint]:
    day_expr = cast(func.date(ProcessedEmail.processed_at), String)
    rows = (
        await session.execute(
            select(
                day_expr.label("day"),
                _count("processed"),
                _count("review", ProcessedEmail.review_required.is_(True)),
                _count(
                    "failures", ProcessedEmail.mailbox_action_status.in_(FAILED_STATES)
                ),
            )
            .where(scope, ProcessedEmail.processed_at >= range_start)
            .group_by(func.date(ProcessedEmail.processed_at))
            .order_by(func.date(ProcessedEmail.processed_at))
        )
    ).all()
    by_day = {
        str(row.day): DashboardTrendPoint(
            day=str(row.day),
            processed=int(row.processed),
            review=int(row.review),
            failures=int(row.failures),
        )
        for row in rows
    }
    return [
        by_day.get(
            (range_start.date() + timedelta(days=offset)).isoformat(),
            DashboardTrendPoint(
                day=(range_start.date() + timedelta(days=offset)).isoformat()
            ),
        )
        for offset in range(range_days)
    ]


async def _build_breakdowns(
    session: AsyncSession, scope, range_start: datetime
) -> tuple[list[DashboardBreakdownItem], list[DashboardBreakdownItem]]:
    category_rows = (
        await session.execute(
            select(ProcessedEmail.category, func.count(ProcessedEmail.id))
            .where(scope, ProcessedEmail.processed_at >= range_start)
            .group_by(ProcessedEmail.category)
            .order_by(func.count(ProcessedEmail.id).desc())
        )
    ).all()
    source = case(
        (ProcessedEmail.decision_memory_id.is_not(None), "decision_memory"),
        (ProcessedEmail.classification_stage >= 2, "deep_model"),
        else_="fast_model",
    ).label("source")
    handling_rows = (
        await session.execute(
            select(source, func.count(ProcessedEmail.id).label("count"))
            .where(scope, ProcessedEmail.processed_at >= range_start)
            .group_by("source")
        )
    ).all()
    categories = [
        DashboardBreakdownItem(key=str(key), count=int(count))
        for key, count in category_rows
    ]
    handling = [
        DashboardBreakdownItem(key=str(key), count=int(count))
        for key, count in handling_rows
    ]
    return categories, handling


async def _mailbox_counts(session: AsyncSession, scope, today_start: datetime) -> dict:
    pending = or_(
        ProcessedEmail.action_review_required.is_(True),
        ProcessedEmail.mailbox_action_status.in_(PENDING_STATES),
    )
    rows = (
        await session.execute(
            select(
                ProcessedEmail.account_id,
                _count("processed_today", ProcessedEmail.processed_at >= today_start),
                _count("review_count", ProcessedEmail.review_required.is_(True)),
                _count("pending_count", pending),
            )
            .where(scope)
            .group_by(ProcessedEmail.account_id)
        )
    ).all()
    return {row.account_id: row for row in rows}


async def _backfills(
    session: AsyncSession, account_ids: list[UUID]
) -> dict[UUID, BackfillJob]:
    rows = (
        await session.execute(
            select(BackfillJob)
            .where(
                BackfillJob.account_id.in_(account_ids),
                BackfillJob.state.in_(ACTIVE_BACKFILL_STATES),
            )
            .order_by(BackfillJob.updated_at.desc())
        )
    ).scalars()
    result: dict[UUID, BackfillJob] = {}
    for job in rows:
        result.setdefault(job.account_id, job)
    return result


async def _inference(accounts: list[EmailAccount]) -> tuple[dict, str, str | None]:
    try:
        snapshots = await asyncio.wait_for(
            asyncio.gather(
                *(read_inference_health(account.id) for account in accounts)
            ),
            timeout=1.5,
        )
    except Exception:
        return {}, "unknown", None
    mapping = dict(zip((account.id for account in accounts), snapshots, strict=True))
    if any(bool(snapshot and snapshot.get("degraded")) for snapshot in snapshots):
        return (
            mapping,
            "degraded",
            "Inference is degraded for at least one authorized mailbox.",
        )
    if any(snapshot and snapshot.get("status") == "ok" for snapshot in snapshots):
        return mapping, "ok", None
    return mapping, "unknown", None


def _mailbox_status(account, counts, job, snapshot) -> DashboardMailboxStatus:
    health = "healthy" if account.is_active else "paused"
    if snapshot and snapshot.get("degraded"):
        health = "degraded"
    if job is not None and job.last_error:
        health = "attention"
    return DashboardMailboxStatus(
        account_id=account.id,
        label=account.username,
        ownership_mode=account.ownership_mode,
        is_active=account.is_active,
        last_cycle_at=account.last_cycle_at,
        processed_today=int(counts.processed_today if counts else 0),
        review_count=int(counts.review_count if counts else 0),
        pending_count=int(counts.pending_count if counts else 0),
        health=health,
        last_error=job.last_error if job else None,
        backfill_status=job.state if job else None,
        backfill_processed=job.processed if job else None,
        backfill_total=job.total_discovered if job else None,
    )


async def build_dashboard(
    session: AsyncSession,
    identity: RequestIdentity,
    *,
    range_days: int = 7,
) -> DashboardOverview:
    now, today_start, range_start = _time_window(range_days)
    accounts = await accessible_accounts(session, identity)
    account_ids = [account.id for account in accounts]
    if not account_ids:
        return DashboardOverview(
            range_days=range_days,
            generated_at=now,
            counters=DashboardCounters(),
            trend=[],
            categories=[],
            handling=[],
            mailboxes=[],
        )
    scope = ProcessedEmail.account_id.in_(account_ids)
    counters = await _build_counters(
        session, scope, account_ids, range_start, today_start
    )
    trend = await _build_trend(session, scope, range_start, range_days)
    categories, handling = await _build_breakdowns(session, scope, range_start)
    counts = await _mailbox_counts(session, scope, today_start)
    jobs = await _backfills(session, account_ids)
    inference, status, warning = await _inference(accounts)
    mailboxes = [
        _mailbox_status(
            account,
            counts.get(account.id),
            jobs.get(account.id),
            inference.get(account.id),
        )
        for account in accounts
    ]
    return DashboardOverview(
        range_days=range_days,
        generated_at=now,
        counters=counters,
        trend=trend,
        categories=categories,
        handling=handling,
        mailboxes=mailboxes,
        inference_status=status,
        inference_warning=warning,
    )
