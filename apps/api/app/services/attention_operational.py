"""Operational review items derived from existing persisted job/account state."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.attention_schemas import OperationalReviewItem
from app.auth import RequestIdentity
from app.mailbox_access import SHARED_ADMIN_ROLES, access_condition
from app.models.backfill import BackfillFailure, BackfillJob
from app.models.bulk import BulkApplyJob, BulkProposal
from app.models.email_account import EmailAccount


async def list_operational_review_items(
    session: AsyncSession,
    identity: RequestIdentity,
) -> list[OperationalReviewItem]:
    """Return non-message exceptions without duplicating their source state."""
    items: list[OperationalReviewItem] = []

    failure_rows = (
        await session.execute(
            select(BackfillFailure, BackfillJob, EmailAccount)
            .join(BackfillJob, BackfillJob.id == BackfillFailure.job_id)
            .join(EmailAccount, EmailAccount.id == BackfillJob.account_id)
            .where(
                access_condition(identity),
                BackfillFailure.status.in_(("failed", "review")),
            )
        )
    ).all()
    for failure, job, account in failure_rows:
        items.append(
            OperationalReviewItem(
                id=failure.id,
                source_type="backfill_failure",
                account_id=account.id,
                account_label=account.username,
                ownership_mode=account.ownership_mode,
                title=f"Backfill message UID {failure.uid}",
                reason=failure.last_error or "Historical message needs review",
                status=failure.status,
                priority=75 if failure.status == "failed" else 65,
                created_at=failure.updated_at,
                job_id=job.id,
                uid=failure.uid,
                folder=job.folder,
                retry_available=failure.status in {"failed", "review"},
                management_url=f"/app/processing?account={account.id}&job={job.id}",
            )
        )

    proposal_rows = (
        await session.execute(
            select(BulkProposal, EmailAccount)
            .join(EmailAccount, EmailAccount.id == BulkProposal.account_id)
            .where(
                access_condition(identity),
                BulkProposal.status.in_(("failed", "review")),
            )
        )
    ).all()

    # Older apply runs treated a message that was no longer present at its
    # historical source-folder/UID position as a human review item. There is
    # nothing useful for a user to decide in that situation, so self-heal those
    # stale proposal rows as skipped and keep the aggregate apply counters in sync.
    stale_by_job: dict = {}
    now = datetime.now(tz=UTC)
    for proposal, _account in proposal_rows:
        if proposal.last_error != "message_missing_or_moved":
            continue
        proposal.status = "skipped"
        proposal.last_error = None
        proposal.updated_at = now
        stale_by_job[proposal.job_id] = stale_by_job.get(proposal.job_id, 0) + 1

    if stale_by_job:
        apply_jobs = list(
            (
                await session.execute(
                    select(BulkApplyJob).where(
                        BulkApplyJob.source_job_id.in_(tuple(stale_by_job))
                    )
                )
            ).scalars()
        )
        for apply_job in apply_jobs:
            repaired = stale_by_job.get(apply_job.source_job_id, 0)
            if not repaired:
                continue
            apply_job.review_required = max(apply_job.review_required - repaired, 0)
            apply_job.skipped += repaired
            apply_job.updated_at = now
        await session.commit()

    for proposal, account in proposal_rows:
        if proposal.status == "skipped":
            continue
        snapshot = dict(proposal.edited_snapshot or proposal.original_snapshot or {})
        reason = proposal.last_error or str(
            snapshot.get("reason") or "Bulk proposal needs review"
        )
        items.append(
            OperationalReviewItem(
                id=proposal.id,
                source_type="bulk_proposal",
                account_id=account.id,
                account_label=account.username,
                ownership_mode=account.ownership_mode,
                title=f"Bulk proposal UID {proposal.uid}",
                reason=reason[:500],
                status=proposal.status,
                priority=75 if proposal.status == "failed" else 65,
                created_at=proposal.updated_at,
                job_id=proposal.job_id,
                uid=proposal.uid,
                folder=proposal.source_folder,
                management_url=(
                    f"/app/processing?account={account.id}&job={proposal.job_id}"
                ),
            )
        )

    if identity.user_id is None or identity.role in SHARED_ADMIN_ROLES:
        unresolved = list(
            (
                await session.execute(
                    select(EmailAccount).where(
                        EmailAccount.org_id == identity.org.id,
                        EmailAccount.ownership_mode == "unresolved",
                    )
                )
            ).scalars()
        )
        for account in unresolved:
            items.append(
                OperationalReviewItem(
                    id=account.id,
                    source_type="mailbox_ownership",
                    account_id=account.id,
                    account_label=account.username,
                    ownership_mode=account.ownership_mode,
                    title="Mailbox ownership needs resolution",
                    reason="Legacy mailbox has no resolved private/shared owner policy.",
                    status="unresolved",
                    priority=80,
                    created_at=account.created_at,
                    management_url=f"/app/accounts/{account.id}",
                )
            )

    items.sort(key=lambda item: (-item.priority, -item.created_at.timestamp()))
    return items
