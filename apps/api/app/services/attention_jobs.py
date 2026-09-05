"""Materialize non-message attention events from persisted operational state."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.attention_schemas import NotificationPreferenceView
from app.auth import RequestIdentity
from app.mailbox_access import access_condition
from app.models.attention import NotificationEvent
from app.models.backfill import BackfillJob
from app.models.bulk import BulkApplyJob
from app.models.email_account import EmailAccount
from app.models.lifecycle_event import LifecycleEvent
from app.services.attention import actor_key


async def materialize_operational_notifications(
    session: AsyncSession,
    identity: RequestIdentity,
    preferences: NotificationPreferenceView,
) -> None:
    since = datetime.now(tz=UTC) - timedelta(days=7)
    existing = set(
        (
            await session.execute(
                select(NotificationEvent.dedupe_key).where(
                    NotificationEvent.org_id == identity.org.id,
                    NotificationEvent.user_key == actor_key(identity),
                )
            )
        ).scalars()
    )

    if preferences.jobs_enabled:
        backfills = (
            await session.execute(
                select(BackfillJob, EmailAccount)
                .join(EmailAccount, EmailAccount.id == BackfillJob.account_id)
                .where(
                    access_condition(identity),
                    BackfillJob.state.in_(["completed", "failed"]),
                    BackfillJob.updated_at >= since,
                )
            )
        ).all()
        for job, account in backfills:
            key = f"backfill:{job.id}:{job.state}"
            if key in existing:
                continue
            failed = job.state == "failed"
            session.add(
                NotificationEvent(
                    org_id=identity.org.id,
                    user_key=actor_key(identity),
                    account_id=account.id,
                    event_type=f"backfill_{job.state}",
                    severity="warning" if failed else "info",
                    title="Historical backfill failed"
                    if failed
                    else "Historical backfill completed",
                    body=(
                        job.last_error
                        or f"{account.username}: {job.processed} processed"
                    )[:500],
                    dedupe_key=key,
                    metadata_json={"job_id": str(job.id), "folder": job.folder},
                )
            )
            existing.add(key)

        bulk_jobs = (
            await session.execute(
                select(BulkApplyJob, EmailAccount)
                .join(EmailAccount, EmailAccount.id == BulkApplyJob.account_id)
                .where(
                    access_condition(identity),
                    BulkApplyJob.state.in_(["completed", "failed"]),
                    BulkApplyJob.updated_at >= since,
                )
            )
        ).all()
        for job, account in bulk_jobs:
            key = f"bulk:{job.id}:{job.state}:{job.failed}:{job.skipped}"
            if key in existing:
                continue
            has_problem = job.state == "failed" or job.failed > 0 or job.skipped > 0
            session.add(
                NotificationEvent(
                    org_id=identity.org.id,
                    user_key=actor_key(identity),
                    account_id=account.id,
                    event_type="bulk_apply_problem"
                    if has_problem
                    else "bulk_apply_completed",
                    severity="warning" if has_problem else "info",
                    title="Bulk apply needs attention"
                    if has_problem
                    else "Bulk apply completed",
                    body=(
                        job.last_error
                        or f"{account.username}: {job.applied} applied, {job.skipped} skipped, {job.failed} failed"
                    )[:500],
                    dedupe_key=key,
                    metadata_json={"job_id": str(job.id)},
                )
            )
            existing.add(key)

    if preferences.mailbox_health_enabled:
        lifecycle_rows = (
            await session.execute(
                select(LifecycleEvent, EmailAccount)
                .join(EmailAccount, EmailAccount.id == LifecycleEvent.account_id)
                .where(
                    access_condition(identity),
                    LifecycleEvent.status != "success",
                    LifecycleEvent.created_at >= since,
                )
            )
        ).all()
        for event, account in lifecycle_rows:
            key = f"health:{event.id}"
            if key in existing:
                continue
            details = event.details or {}
            safe_detail = str(
                details.get("reason") or details.get("error") or event.event
            )
            session.add(
                NotificationEvent(
                    org_id=identity.org.id,
                    user_key=actor_key(identity),
                    account_id=account.id,
                    event_type="mailbox_health",
                    severity="warning",
                    title="Mailbox health needs attention",
                    body=f"{account.username}: {safe_detail}"[:500],
                    dedupe_key=key,
                    metadata_json={"event": event.event},
                )
            )
            existing.add(key)

    await session.commit()
