"""Backfill repository tests against real PostgreSQL."""

from __future__ import annotations

from uuid import uuid4

import pytest

from app.models.email_account import EmailAccount
from app.models.organization import Organization
from app.repositories.backfill import (
    BackfillConflictError,
    BackfillRepository,
    BackfillStateError,
)


async def _account(session, suffix: str) -> EmailAccount:
    org = Organization(name=f"Backfill {suffix}", slug=f"bf-{uuid4().hex[:8]}")
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


async def test_only_one_active_job_per_account_folder(session) -> None:
    account = await _account(session, "conflict")
    repo = BackfillRepository(session)
    first = await repo.create(account.id, folder="INBOX", batch_size=10)
    await session.commit()

    with pytest.raises(BackfillConflictError):
        await repo.create(account.id, folder="INBOX", batch_size=10)

    assert first.state == "running"


async def test_completed_job_allows_new_backfill(session) -> None:
    account = await _account(session, "complete")
    repo = BackfillRepository(session)
    first = await repo.create(account.id, folder="INBOX")
    await repo.transition(first.id, "completed")
    await session.commit()

    second = await repo.create(account.id, folder="INBOX")
    await session.commit()

    assert second.id != first.id
    assert second.state == "running"


async def test_checkpoint_is_monotonic_and_restart_safe(session) -> None:
    account = await _account(session, "cursor")
    repo = BackfillRepository(session)
    job = await repo.create(account.id, batch_size=10)
    await repo.initialize_discovery(job.id, uidvalidity=77, total_discovered=100)
    await repo.checkpoint(
        job.id,
        cursor_uid=25,
        processed_delta=10,
        successful_delta=9,
        review_delta=2,
        failed_delta=1,
    )
    await session.commit()

    await session.refresh(job)
    assert job.uidvalidity == 77
    assert job.cursor_uid == 25
    assert job.total_discovered == 100
    assert job.processed == 10
    assert job.successful == 9
    assert job.review_required == 2
    assert job.failed == 1

    with pytest.raises(ValueError, match="cannot move backwards"):
        await repo.checkpoint(job.id, cursor_uid=24)


async def test_uidvalidity_change_marks_job_failed(session) -> None:
    account = await _account(session, "uidvalidity")
    repo = BackfillRepository(session)
    job = await repo.create(account.id)
    await repo.initialize_discovery(job.id, uidvalidity=10, total_discovered=50)
    await session.commit()

    with pytest.raises(BackfillStateError, match="uidvalidity_changed"):
        await repo.initialize_discovery(job.id, uidvalidity=11, total_discovered=50)
    await session.commit()
    await session.refresh(job)

    assert job.state == "failed"
    assert job.last_error == "uidvalidity_changed"


async def test_pause_resume_cancel_transitions(session) -> None:
    account = await _account(session, "states")
    repo = BackfillRepository(session)
    job = await repo.create(account.id)

    assert (await repo.transition(job.id, "paused")).state == "paused"
    assert (await repo.transition(job.id, "running")).state == "running"
    assert (await repo.transition(job.id, "cancelled")).state == "cancelled"

    with pytest.raises(BackfillStateError):
        await repo.transition(job.id, "running")
