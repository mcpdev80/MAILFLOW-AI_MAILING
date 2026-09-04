"""Persistence helpers for resumable historical mailbox backfill."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.backfill import BackfillFailure, BackfillJob
from app.models.processed_email import ProcessedEmail


class BackfillConflictError(RuntimeError):
    """Raised when an account/folder already has an active backfill."""


class BackfillStateError(RuntimeError):
    """Raised when a requested state transition is not valid."""


_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "running": {"paused", "completed", "cancelled", "failed"},
    "paused": {"running", "cancelled", "failed"},
    "completed": set(),
    "cancelled": set(),
    "failed": {"running", "cancelled"},
}


class BackfillRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(
        self, job_id: UUID, *, for_update: bool = False
    ) -> BackfillJob | None:
        stmt = select(BackfillJob).where(BackfillJob.id == job_id)
        if for_update:
            stmt = stmt.with_for_update()
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def get_failure(
        self, failure_id: UUID, *, for_update: bool = False
    ) -> BackfillFailure | None:
        stmt = select(BackfillFailure).where(BackfillFailure.id == failure_id)
        if for_update:
            stmt = stmt.with_for_update()
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def list_for_account(self, account_id: UUID) -> list[BackfillJob]:
        rows = await self._session.execute(
            select(BackfillJob)
            .where(BackfillJob.account_id == account_id)
            .order_by(BackfillJob.created_at.desc())
        )
        return list(rows.scalars())

    async def active_for_folder(
        self, account_id: UUID, folder: str
    ) -> BackfillJob | None:
        return (
            await self._session.execute(
                select(BackfillJob).where(
                    BackfillJob.account_id == account_id,
                    BackfillJob.folder == folder,
                    BackfillJob.state.in_(("running", "paused")),
                )
            )
        ).scalar_one_or_none()

    async def create(
        self,
        account_id: UUID,
        *,
        folder: str = "INBOX",
        batch_size: int = 10,
        start_running: bool = True,
    ) -> BackfillJob:
        if batch_size <= 0:
            raise ValueError("batch_size must be positive")
        if await self.active_for_folder(account_id, folder) is not None:
            raise BackfillConflictError(
                f"active backfill already exists for account={account_id} folder={folder}"
            )
        job = BackfillJob(
            account_id=account_id,
            folder=folder,
            batch_size=batch_size,
            state="running" if start_running else "paused",
        )
        self._session.add(job)
        await self._session.flush()
        return job

    async def transition(self, job_id: UUID, target: str) -> BackfillJob:
        job = await self.get(job_id, for_update=True)
        if job is None:
            raise KeyError(str(job_id))
        if target == job.state:
            return job
        allowed = _ALLOWED_TRANSITIONS.get(job.state, set())
        if target not in allowed:
            raise BackfillStateError(f"cannot transition {job.state} -> {target}")
        job.state = target
        job.updated_at = datetime.now(tz=UTC)
        await self._session.flush()
        return job

    async def initialize_discovery(
        self,
        job_id: UUID,
        *,
        uidvalidity: int,
        total_discovered: int,
    ) -> BackfillJob:
        job = await self.get(job_id, for_update=True)
        if job is None:
            raise KeyError(str(job_id))
        if job.uidvalidity is not None and job.uidvalidity != uidvalidity:
            job.state = "failed"
            job.last_error = "uidvalidity_changed"
            job.updated_at = datetime.now(tz=UTC)
            await self._session.flush()
            raise BackfillStateError("uidvalidity_changed")
        job.uidvalidity = uidvalidity
        job.total_discovered = max(job.total_discovered, total_discovered)
        job.updated_at = datetime.now(tz=UTC)
        await self._session.flush()
        return job

    async def checkpoint(
        self,
        job_id: UUID,
        *,
        cursor_uid: int,
        processed_delta: int = 0,
        successful_delta: int = 0,
        review_delta: int = 0,
        failed_delta: int = 0,
        last_error: str | None = None,
    ) -> BackfillJob:
        job = await self.get(job_id, for_update=True)
        if job is None:
            raise KeyError(str(job_id))
        if job.cursor_uid is not None and cursor_uid < job.cursor_uid:
            raise ValueError("backfill cursor cannot move backwards")
        job.cursor_uid = cursor_uid
        job.processed += processed_delta
        job.successful += successful_delta
        job.review_required += review_delta
        job.failed += failed_delta
        job.last_error = last_error
        job.updated_at = datetime.now(tz=UTC)
        await self._session.flush()
        return job

    async def is_processed(
        self,
        account_id: UUID,
        *,
        uidvalidity: int,
        uid: int,
    ) -> bool:
        existing = (
            await self._session.execute(
                select(ProcessedEmail.id).where(
                    ProcessedEmail.account_id == account_id,
                    ProcessedEmail.uidvalidity == uidvalidity,
                    ProcessedEmail.uid == uid,
                )
            )
        ).scalar_one_or_none()
        return existing is not None

    async def processed_review_required(
        self,
        account_id: UUID,
        *,
        uidvalidity: int,
        uid: int,
    ) -> bool:
        value = (
            await self._session.execute(
                select(ProcessedEmail.review_required).where(
                    ProcessedEmail.account_id == account_id,
                    ProcessedEmail.uidvalidity == uidvalidity,
                    ProcessedEmail.uid == uid,
                )
            )
        ).scalar_one_or_none()
        return bool(value)

    async def record_failure(
        self,
        job_id: UUID,
        *,
        uidvalidity: int,
        uid: int,
        classification_stage: int | None,
        error: str,
        review_required: bool = False,
    ) -> BackfillFailure:
        failure = (
            await self._session.execute(
                select(BackfillFailure).where(
                    BackfillFailure.job_id == job_id,
                    BackfillFailure.uidvalidity == uidvalidity,
                    BackfillFailure.uid == uid,
                )
            )
        ).scalar_one_or_none()
        if failure is None:
            failure = BackfillFailure(
                job_id=job_id,
                uidvalidity=uidvalidity,
                uid=uid,
                status="review" if review_required else "failed",
                classification_stage=classification_stage,
                review_required=review_required,
                last_error=error[:500],
            )
            self._session.add(failure)
        else:
            failure.attempts += 1
            failure.status = "review" if review_required else "failed"
            failure.classification_stage = classification_stage
            failure.review_required = review_required
            failure.last_error = error[:500]
            failure.updated_at = datetime.now(tz=UTC)
        await self._session.flush()
        return failure

    async def mark_failure_retrying(self, failure_id: UUID) -> BackfillFailure:
        failure = await self.get_failure(failure_id, for_update=True)
        if failure is None:
            raise KeyError(str(failure_id))
        if failure.status not in {"failed", "review"}:
            raise BackfillStateError(f"cannot retry failure in state {failure.status}")
        failure.status = "retrying"
        failure.updated_at = datetime.now(tz=UTC)
        await self._session.flush()
        return failure

    async def resolve_failure(
        self,
        job_id: UUID,
        *,
        uidvalidity: int,
        uid: int,
    ) -> None:
        failure = (
            await self._session.execute(
                select(BackfillFailure).where(
                    BackfillFailure.job_id == job_id,
                    BackfillFailure.uidvalidity == uidvalidity,
                    BackfillFailure.uid == uid,
                )
            )
        ).scalar_one_or_none()
        if failure is not None:
            failure.status = "resolved"
            failure.last_error = None
            failure.updated_at = datetime.now(tz=UTC)
            await self._session.flush()

    async def apply_retry_success(
        self,
        job_id: UUID,
        failure_id: UUID,
        *,
        review_required: bool,
    ) -> None:
        job = await self.get(job_id, for_update=True)
        failure = await self.get_failure(failure_id, for_update=True)
        if job is None or failure is None or failure.job_id != job_id:
            raise KeyError(str(failure_id))
        failure.status = "resolved"
        failure.last_error = None
        failure.updated_at = datetime.now(tz=UTC)
        if job.failed > 0:
            job.failed -= 1
        job.successful += 1
        if review_required:
            job.review_required += 1
        job.updated_at = datetime.now(tz=UTC)
        await self._session.flush()

    async def unresolved_failures(self, job_id: UUID) -> list[BackfillFailure]:
        rows = await self._session.execute(
            select(BackfillFailure)
            .where(
                BackfillFailure.job_id == job_id,
                BackfillFailure.status.in_(("failed", "review")),
            )
            .order_by(BackfillFailure.uid.asc())
        )
        return list(rows.scalars())
