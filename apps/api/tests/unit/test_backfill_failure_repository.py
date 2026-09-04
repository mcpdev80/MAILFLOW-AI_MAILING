"""Targeted backfill failure state does not rewind whole jobs."""

from __future__ import annotations

from uuid import uuid4

from app.models.email_account import EmailAccount
from app.models.organization import Organization
from app.repositories.backfill import BackfillRepository


async def test_final_failure_can_move_to_retrying_and_resolved(session) -> None:
    org = Organization(name="Backfill Retry", slug=f"bf-retry-{uuid4().hex[:8]}")
    session.add(org)
    await session.flush()
    account = EmailAccount(
        org_id=org.id,
        imap_host="imap.example.com",
        username="retry@example.com",
        ownership_mode="shared",
    )
    session.add(account)
    await session.commit()

    repo = BackfillRepository(session)
    job = await repo.create(account.id)
    await repo.initialize_discovery(job.id, uidvalidity=77, total_discovered=1)
    failure = await repo.record_failure(
        job.id,
        uidvalidity=77,
        uid=42,
        classification_stage=2,
        error="model unavailable",
    )
    failure = await repo.record_failure(
        job.id,
        uidvalidity=77,
        uid=42,
        classification_stage=2,
        error="model unavailable",
    )
    failure = await repo.record_failure(
        job.id,
        uidvalidity=77,
        uid=42,
        classification_stage=2,
        error="model unavailable",
    )
    await repo.checkpoint(
        job.id,
        cursor_uid=42,
        processed_delta=1,
        failed_delta=1,
    )
    await session.commit()

    assert failure.attempts == 3
    retrying = await repo.mark_failure_retrying(failure.id)
    assert retrying.status == "retrying"

    await repo.apply_retry_success(
        job.id,
        failure.id,
        review_required=False,
    )
    await session.commit()
    await session.refresh(job)
    await session.refresh(failure)

    assert failure.status == "resolved"
    assert job.processed == 1
    assert job.failed == 0
    assert job.successful == 1
