"""Fast authorization-scoped dashboard aggregates and metadata search."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import and_, case, cast, func, or_, select, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity
from app.dashboard_schemas import (
    DashboardBreakdownItem,
    DashboardCounters,
    DashboardMailboxStatus,
    DashboardOverview,
    DashboardTrendPoint,
    MessageSearchItem,
    MessageSearchResult,
)
from app.mailbox_access import access_condition
from app.models.backfill import BackfillJob
from app.models.email_account import EmailAccount
from app.models.processed_email import ProcessedEmail

_FAILED_STATES = ("blocked", "failed", "error", "deferred")
_PENDING_STATES = ("review", "pending", "queued", "deferred")
_AUTOMATED_ACTIONS = ("move", "archive", "tag")
_ACTIVE_BACKFILL_STATES = ("running", "paused")


def _classification_source(row: ProcessedEmail) -> str:
    if row.decision_memory_id is not None:
        return "decision_memory"
    if row.classification_stage is not None and row.classification_stage >= 2:
        return "deep_model"
    return "fast_model"


async def _accessible_accounts(
    session: AsyncSession, identity: RequestIdentity
) -> list[EmailAccount]:
    return list(
        (
            await session.execute(
                select(EmailAccount)
                .where(access_condition(identity))
                .order_by(EmailAccount.username.asc())
            )
        ).scalars()
    )


async def build_dashboard(
    session: AsyncSession,
    identity: RequestIdentity,
    *,
    range_days: int = 7,
) -> DashboardOverview:
    """Return compact dashboard aggregates for only authorized mailboxes."""
    now = datetime.now(UTC)
    today_start = datetime.combine(now.date(), datetime.min.time(), tzinfo=UTC)
    range_start = today_start - timedelta(days=max(range_days - 1, 0))
    accounts = await _accessible_accounts(session, identity)
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
    counter_row = (
        await session.execute(
            select(
                func.count(ProcessedEmail.id).label("total_processed"),
                func.count(ProcessedEmail.id)
                .filter(ProcessedEmail.processed_at >= range_start)
                .label("processed_range"),
                func.count(ProcessedEmail.id)
                .filter(ProcessedEmail.processed_at >= today_start)
                .label("processed_today"),
                func.count(ProcessedEmail.id)
                .filter(
                    or_(
                        ProcessedEmail.action_review_required.is_(True),
                        ProcessedEmail.mailbox_action_status.in_(_PENDING_STATES),
                    )
                )
                .label("pending_or_queued"),
                func.count(ProcessedEmail.id)
                .filter(ProcessedEmail.review_required.is_(True))
                .label("review_required"),
                func.count(ProcessedEmail.id)
                .filter(ProcessedEmail.urgency.in_(("immediate", "today")))
                .label("urgent"),
                func.count(ProcessedEmail.id)
                .filter(ProcessedEmail.action_required == "yes")
                .label("action_required"),
                func.count(ProcessedEmail.id)
                .filter(ProcessedEmail.mailbox_action_status.in_(_FAILED_STATES))
                .label("failed_or_deferred"),
                func.count(ProcessedEmail.id)
                .filter(
                    and_(
                        ProcessedEmail.mailbox_action.in_(_AUTOMATED_ACTIONS),
                        ProcessedEmail.mailbox_action_status == "execute",
                    )
                )
                .label("automated_actions"),
                func.count(ProcessedEmail.id)
                .filter(ProcessedEmail.decision_memory_id.is_not(None))
                .label("decision_memory"),
                func.count(ProcessedEmail.id)
                .filter(
                    and_(
                        ProcessedEmail.decision_memory_id.is_(None),
                        or_(
                            ProcessedEmail.classification_stage.is_(None),
                            ProcessedEmail.classification_stage <= 1,
                        ),
                    )
                )
                .label("fast_model"),
                func.count(ProcessedEmail.id)
                .filter(
                    and_(
                        ProcessedEmail.decision_memory_id.is_(None),
                        ProcessedEmail.classification_stage >= 2,
                    )
                )
                .label("deep_model"),
            ).where(scope)
        )
    ).one()

    active_backfills = int(
        (
            await session.scalar(
                select(func.count(BackfillJob.id)).where(
                    BackfillJob.account_id.in_(account_ids),
                    BackfillJob.state.in_(_ACTIVE_BACKFILL_STATES),
                )
            )
        )
        or 0
    )

    counters = DashboardCounters(
        **{
            key: int(getattr(counter_row, key) or 0)
            for key in DashboardCounters.model_fields
            if key != "active_backfills"
        },
        active_backfills=active_backfills,
    )

    day_expr = cast(func.date(ProcessedEmail.processed_at), String)
    trend_rows = (
        await session.execute(
            select(
                day_expr.label("day"),
                func.count(ProcessedEmail.id).label("processed"),
                func.count(ProcessedEmail.id)
                .filter(ProcessedEmail.review_required.is_(True))
                .label("review"),
                func.count(ProcessedEmail.id)
                .filter(ProcessedEmail.mailbox_action_status.in_(_FAILED_STATES))
                .label("failures"),
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
        for row in trend_rows
    }
    trend = []
    for offset in range(range_days):
        day = (range_start.date() + timedelta(days=offset)).isoformat()
        trend.append(by_day.get(day, DashboardTrendPoint(day=day)))

    category_rows = (
        await session.execute(
            select(ProcessedEmail.category, func.count(ProcessedEmail.id))
            .where(scope, ProcessedEmail.processed_at >= range_start)
            .group_by(ProcessedEmail.category)
            .order_by(func.count(ProcessedEmail.id).desc())
        )
    ).all()
    categories = [
        DashboardBreakdownItem(key=str(key), count=int(count))
        for key, count in category_rows
    ]

    handling_rows = (
        await session.execute(
            select(
                case(
                    (ProcessedEmail.decision_memory_id.is_not(None), "decision_memory"),
                    (ProcessedEmail.classification_stage >= 2, "deep_model"),
                    else_="fast_model",
                ).label("source"),
                func.count(ProcessedEmail.id).label("count"),
            )
            .where(scope, ProcessedEmail.processed_at >= range_start)
            .group_by("source")
        )
    ).all()
    handling = [
        DashboardBreakdownItem(key=str(key), count=int(count))
        for key, count in handling_rows
    ]

    mailbox_aggregate = (
        await session.execute(
            select(
                ProcessedEmail.account_id,
                func.count(ProcessedEmail.id)
                .filter(ProcessedEmail.processed_at >= today_start)
                .label("processed_today"),
                func.count(ProcessedEmail.id)
                .filter(ProcessedEmail.review_required.is_(True))
                .label("review_count"),
                func.count(ProcessedEmail.id)
                .filter(
                    or_(
                        ProcessedEmail.action_review_required.is_(True),
                        ProcessedEmail.mailbox_action_status.in_(_PENDING_STATES),
                    )
                )
                .label("pending_count"),
            )
            .where(scope)
            .group_by(ProcessedEmail.account_id)
        )
    ).all()
    mailbox_counts = {row.account_id: row for row in mailbox_aggregate}

    backfill_rows = (
        await session.execute(
            select(BackfillJob)
            .where(
                BackfillJob.account_id.in_(account_ids),
                BackfillJob.state.in_(_ACTIVE_BACKFILL_STATES),
            )
            .order_by(BackfillJob.updated_at.desc())
        )
    ).scalars()
    backfill_by_account: dict[UUID, BackfillJob] = {}
    for job in backfill_rows:
        backfill_by_account.setdefault(job.account_id, job)

    mailboxes: list[DashboardMailboxStatus] = []
    for account in accounts:
        counts = mailbox_counts.get(account.id)
        job = backfill_by_account.get(account.id)
        health = "healthy" if account.is_active else "paused"
        if job is not None and job.last_error:
            health = "attention"
        mailboxes.append(
            DashboardMailboxStatus(
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
        )

    return DashboardOverview(
        range_days=range_days,
        generated_at=now,
        counters=counters,
        trend=trend,
        categories=categories,
        handling=handling,
        mailboxes=mailboxes,
    )


async def search_messages(
    session: AsyncSession,
    identity: RequestIdentity,
    *,
    query: str | None = None,
    sender: str | None = None,
    account_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    category: str | None = None,
    subcategory: str | None = None,
    importance: str | None = None,
    urgency: str | None = None,
    action_required: str | None = None,
    review_required: bool | None = None,
    suspicious_content: bool | None = None,
    tag: str | None = None,
    destination_folder: str | None = None,
    classification_source: str | None = None,
    processed_state: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> MessageSearchResult:
    """Search persisted metadata after applying the mailbox authorization boundary."""
    predicates = [access_condition(identity)]
    if account_id is not None:
        predicates.append(EmailAccount.id == account_id)
    if query:
        needle = f"%{query.strip()}%"
        predicates.append(
            or_(
                ProcessedEmail.subject.ilike(needle),
                ProcessedEmail.from_email.ilike(needle),
            )
        )
    if sender:
        predicates.append(ProcessedEmail.from_email.ilike(f"%{sender.strip()}%"))
    if date_from:
        predicates.append(
            ProcessedEmail.processed_at
            >= datetime.combine(date_from, datetime.min.time(), tzinfo=UTC)
        )
    if date_to:
        predicates.append(
            ProcessedEmail.processed_at
            < datetime.combine(
                date_to + timedelta(days=1), datetime.min.time(), tzinfo=UTC
            )
        )
    if category:
        predicates.append(ProcessedEmail.category == category)
    if subcategory:
        predicates.append(ProcessedEmail.subcategory == subcategory)
    if importance:
        predicates.append(ProcessedEmail.importance == importance)
    if urgency:
        predicates.append(ProcessedEmail.urgency == urgency)
    if action_required:
        predicates.append(ProcessedEmail.action_required == action_required)
    if review_required is not None:
        predicates.append(ProcessedEmail.review_required.is_(review_required))
    if suspicious_content is not None:
        predicates.append(ProcessedEmail.suspicious_content.is_(suspicious_content))
    if tag:
        predicates.append(
            or_(
                ProcessedEmail.system_tags.contains([tag]),
                ProcessedEmail.user_tags.contains([tag]),
            )
        )
    if destination_folder:
        predicates.append(ProcessedEmail.destination_folder == destination_folder)
    if classification_source == "decision_memory":
        predicates.append(ProcessedEmail.decision_memory_id.is_not(None))
    elif classification_source == "deep_model":
        predicates.extend(
            [
                ProcessedEmail.decision_memory_id.is_(None),
                ProcessedEmail.classification_stage >= 2,
            ]
        )
    elif classification_source == "fast_model":
        predicates.extend(
            [
                ProcessedEmail.decision_memory_id.is_(None),
                or_(
                    ProcessedEmail.classification_stage.is_(None),
                    ProcessedEmail.classification_stage <= 1,
                ),
            ]
        )
    if processed_state:
        predicates.append(ProcessedEmail.mailbox_action_status == processed_state)

    joined = ProcessedEmail.__table__.join(
        EmailAccount.__table__, ProcessedEmail.account_id == EmailAccount.id
    )
    total = int(
        (
            await session.scalar(
                select(func.count(ProcessedEmail.id))
                .select_from(joined)
                .where(*predicates)
            )
        )
        or 0
    )
    rows = (
        await session.execute(
            select(ProcessedEmail, EmailAccount.username, EmailAccount.ownership_mode)
            .select_from(joined)
            .where(*predicates)
            .order_by(ProcessedEmail.processed_at.desc(), ProcessedEmail.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()

    return MessageSearchResult(
        total=total,
        limit=limit,
        offset=offset,
        items=[
            MessageSearchItem(
                id=row.ProcessedEmail.id,
                account_id=row.ProcessedEmail.account_id,
                account_label=row.username,
                ownership_mode=row.ownership_mode,
                uid=row.ProcessedEmail.uid,
                folder=row.ProcessedEmail.folder,
                from_email=row.ProcessedEmail.from_email,
                subject=row.ProcessedEmail.subject,
                processed_at=row.ProcessedEmail.processed_at,
                category=row.ProcessedEmail.category,
                subcategory=row.ProcessedEmail.subcategory,
                importance=row.ProcessedEmail.importance,
                urgency=row.ProcessedEmail.urgency,
                action_required=row.ProcessedEmail.action_required,
                review_required=row.ProcessedEmail.review_required,
                suspicious_content=row.ProcessedEmail.suspicious_content,
                system_tags=list(row.ProcessedEmail.system_tags or []),
                user_tags=list(row.ProcessedEmail.user_tags or []),
                destination_folder=row.ProcessedEmail.destination_folder,
                classification_source=_classification_source(row.ProcessedEmail),
                processed_state=row.ProcessedEmail.mailbox_action_status,
            )
            for row in rows
        ],
    )
