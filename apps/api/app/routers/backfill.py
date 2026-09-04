"""Mailbox-scoped historical backfill controls and progress."""

from __future__ import annotations

import logging
from uuid import UUID

from arq.connections import RedisSettings, create_pool
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity, require_identity
from app.backfill_queue import enqueue_backfill_batch, enqueue_backfill_failure_retry
from app.backfill_schemas import (
    BackfillControlOut,
    BackfillCreate,
    BackfillFailureOut,
    BackfillFailureRetryOut,
    BackfillProgressOut,
)
from app.config import settings
from app.database import get_session
from app.mailbox_access import get_account_for_management
from app.repositories.backfill import (
    BackfillConflictError,
    BackfillRepository,
    BackfillStateError,
)

logger = logging.getLogger("mailflow.api")

router = APIRouter(prefix="/accounts/{account_id}/backfill", tags=["backfill"])


async def _load_owned_job(
    account_id: UUID,
    job_id: UUID,
    identity: RequestIdentity,
    session: AsyncSession,
    *,
    for_update: bool = False,
):
    await get_account_for_management(account_id, identity, session)
    job = await BackfillRepository(session).get(job_id, for_update=for_update)
    if job is None or job.account_id != account_id:
        raise HTTPException(status_code=404, detail="backfill_job_not_found")
    return job


async def _enqueue(job_id: UUID, cursor_uid: int | None) -> bool:
    redis = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
    try:
        return await enqueue_backfill_batch(redis, job_id=job_id, cursor_uid=cursor_uid)
    finally:
        await redis.close()


async def _enqueue_failure(job_id: UUID, failure_id: UUID) -> bool:
    redis = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
    try:
        return await enqueue_backfill_failure_retry(
            redis, job_id=job_id, failure_id=failure_id
        )
    finally:
        await redis.close()


async def _pause_after_enqueue_failure(
    repo: BackfillRepository, session: AsyncSession, job_id: UUID
) -> None:
    latest = await repo.get(job_id, for_update=True)
    if latest is not None and latest.state == "running":
        await repo.transition(job_id, "paused", actor_type="system")
        await session.commit()


@router.post(
    "", response_model=BackfillControlOut, status_code=status.HTTP_202_ACCEPTED
)
async def start_backfill(
    account_id: UUID,
    payload: BackfillCreate,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> BackfillControlOut:
    await get_account_for_management(account_id, identity, session)
    repo = BackfillRepository(session)
    try:
        job = await repo.create(
            account_id,
            folder=payload.folder,
            mode=payload.mode,
            batch_size=payload.batch_size or settings.BACKFILL_BATCH_SIZE,
            start_running=True,
            actor_user_id=identity.user_id,
        )
        await session.commit()
    except (BackfillConflictError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="backfill_already_active") from exc

    try:
        enqueued = await _enqueue(job.id, job.cursor_uid)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not enqueue backfill %s: %s", job.id, type(exc).__name__)
        enqueued = False
    if not enqueued:
        await _pause_after_enqueue_failure(repo, session, job.id)
        await session.refresh(job)
    return BackfillControlOut(job=BackfillProgressOut.from_job(job), enqueued=enqueued)


@router.get("", response_model=list[BackfillProgressOut])
async def list_backfills(
    account_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[BackfillProgressOut]:
    await get_account_for_management(account_id, identity, session)
    return [
        BackfillProgressOut.from_job(job)
        for job in await BackfillRepository(session).list_for_account(account_id)
    ]


@router.get("/{job_id}", response_model=BackfillProgressOut)
async def get_backfill(
    account_id: UUID,
    job_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> BackfillProgressOut:
    return BackfillProgressOut.from_job(
        await _load_owned_job(account_id, job_id, identity, session)
    )


@router.get("/{job_id}/failures", response_model=list[BackfillFailureOut])
async def list_backfill_failures(
    account_id: UUID,
    job_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[BackfillFailureOut]:
    await _load_owned_job(account_id, job_id, identity, session)
    failures = await BackfillRepository(session).unresolved_failures(job_id)
    return [BackfillFailureOut.model_validate(item) for item in failures]


@router.post(
    "/{job_id}/failures/{failure_id}/retry",
    response_model=BackfillFailureRetryOut,
    status_code=status.HTTP_202_ACCEPTED,
)
async def retry_backfill_failure(
    account_id: UUID,
    job_id: UUID,
    failure_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> BackfillFailureRetryOut:
    await _load_owned_job(account_id, job_id, identity, session)
    repo = BackfillRepository(session)
    failure = await repo.get_failure(failure_id, for_update=True)
    if failure is None or failure.job_id != job_id:
        raise HTTPException(status_code=404, detail="backfill_failure_not_found")
    if failure.attempts < settings.BACKFILL_MAX_ATTEMPTS:
        raise HTTPException(status_code=409, detail="automatic_retry_still_pending")
    try:
        failure = await repo.mark_failure_retrying(failure_id)
        await session.commit()
    except BackfillStateError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="invalid_failure_state") from exc

    try:
        enqueued = await _enqueue_failure(job_id, failure_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Could not enqueue failure %s: %s", failure_id, type(exc).__name__
        )
        enqueued = False
    if not enqueued:
        latest = await repo.get_failure(failure_id, for_update=True)
        if latest is not None and latest.status == "retrying":
            latest.status = "failed"
            await session.commit()
        await session.refresh(failure)
    return BackfillFailureRetryOut(
        failure=BackfillFailureOut.model_validate(failure), enqueued=enqueued
    )


@router.post("/{job_id}/pause", response_model=BackfillControlOut)
async def pause_backfill(
    account_id: UUID,
    job_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> BackfillControlOut:
    await _load_owned_job(account_id, job_id, identity, session)
    repo = BackfillRepository(session)
    try:
        job = await repo.transition(job_id, "paused", actor_user_id=identity.user_id)
        await session.commit()
    except BackfillStateError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="invalid_backfill_state") from exc
    return BackfillControlOut(job=BackfillProgressOut.from_job(job), enqueued=False)


@router.post(
    "/{job_id}/resume",
    response_model=BackfillControlOut,
    status_code=status.HTTP_202_ACCEPTED,
)
async def resume_backfill(
    account_id: UUID,
    job_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> BackfillControlOut:
    current = await _load_owned_job(account_id, job_id, identity, session)
    previous_state = current.state
    repo = BackfillRepository(session)
    try:
        job = await repo.transition(job_id, "running", actor_user_id=identity.user_id)
        await session.commit()
    except BackfillStateError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="invalid_backfill_state") from exc
    try:
        enqueued = await _enqueue(job.id, job.cursor_uid)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not resume backfill %s: %s", job.id, type(exc).__name__)
        enqueued = False
    if not enqueued and previous_state != "running":
        await _pause_after_enqueue_failure(repo, session, job.id)
        await session.refresh(job)
    return BackfillControlOut(job=BackfillProgressOut.from_job(job), enqueued=enqueued)


@router.post("/{job_id}/cancel", response_model=BackfillControlOut)
async def cancel_backfill(
    account_id: UUID,
    job_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> BackfillControlOut:
    await _load_owned_job(account_id, job_id, identity, session)
    repo = BackfillRepository(session)
    try:
        job = await repo.transition(job_id, "cancelled", actor_user_id=identity.user_id)
        await session.commit()
    except BackfillStateError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="invalid_backfill_state") from exc
    return BackfillControlOut(job=BackfillProgressOut.from_job(job), enqueued=False)
