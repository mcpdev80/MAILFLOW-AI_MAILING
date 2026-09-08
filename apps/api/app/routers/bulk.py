"""Review and apply endpoints for historical dry-run proposals."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from arq.connections import RedisSettings, create_pool
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity, require_identity
from app.bulk_schemas import (
    BulkApplyControlOut,
    BulkApplyCreate,
    BulkApplyJobOut,
    BulkApproveAllOut,
    BulkClusterApproveOut,
    BulkClusterEditOut,
    BulkCountsOut,
    BulkProposalEdit,
    BulkProposalOut,
    BulkReviewSummaryOut,
)
from app.config import settings
from app.database import get_session
from app.mailbox_access import get_account_for_management
from app.repositories.backfill import BackfillRepository
from app.repositories.bulk import BulkRepository, BulkStateError
from app.services.bulk_review import build_review_summary, select_cluster_proposals

router = APIRouter(prefix="/accounts/{account_id}/bulk", tags=["bulk"])


async def _owned_source_job(
    account_id: UUID,
    job_id: UUID,
    identity: RequestIdentity,
    session: AsyncSession,
):
    await get_account_for_management(account_id, identity, session)
    job = await BackfillRepository(session).get(job_id)
    if job is None or job.account_id != account_id:
        raise HTTPException(status_code=404, detail="backfill_job_not_found")
    if job.mode not in {"dry_run", "review"}:
        raise HTTPException(
            status_code=409, detail="bulk_review_requires_dry_run_or_review"
        )
    return job


async def _owned_proposal(
    account_id: UUID,
    job_id: UUID,
    proposal_id: UUID,
    identity: RequestIdentity,
    session: AsyncSession,
):
    await _owned_source_job(account_id, job_id, identity, session)
    proposal = await BulkRepository(session).get_proposal(proposal_id)
    if (
        proposal is None
        or proposal.job_id != job_id
        or proposal.account_id != account_id
    ):
        raise HTTPException(status_code=404, detail="bulk_proposal_not_found")
    return proposal


async def _enqueue_apply(apply_job_id: UUID) -> bool:
    redis = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
    try:
        result = await redis.enqueue_job(
            "process_bulk_apply",
            str(apply_job_id),
            _job_id=f"bulk-apply-{apply_job_id}",
        )
        return result is not None
    finally:
        await redis.close()


@router.get("/{job_id}/proposals", response_model=list[BulkProposalOut])
async def list_bulk_proposals(
    account_id: UUID,
    job_id: UUID,
    status_filter: str | None = Query(default=None, alias="status"),
    category: str | None = None,
    destination: str | None = None,
    review_required: bool | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[BulkProposalOut]:
    await _owned_source_job(account_id, job_id, identity, session)
    rows = await BulkRepository(session).list_proposals(
        job_id,
        status=status_filter,
        category=category,
        destination=destination,
        review_required=review_required,
        limit=limit,
        offset=offset,
    )
    return [BulkProposalOut.model_validate(row) for row in rows]


@router.get("/{job_id}/counts", response_model=BulkCountsOut)
async def bulk_counts(
    account_id: UUID,
    job_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> BulkCountsOut:
    await _owned_source_job(account_id, job_id, identity, session)
    return BulkCountsOut(counts=await BulkRepository(session).counts(job_id))


@router.get("/{job_id}/review-summary", response_model=BulkReviewSummaryOut)
async def bulk_review_summary(
    account_id: UUID,
    job_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> BulkReviewSummaryOut:
    await _owned_source_job(account_id, job_id, identity, session)
    rows = await BulkRepository(session).list_proposals(job_id, limit=100000)
    return BulkReviewSummaryOut.model_validate(build_review_summary(rows))


@router.patch("/{job_id}/proposals/{proposal_id}", response_model=BulkProposalOut)
async def edit_bulk_proposal(
    account_id: UUID,
    job_id: UUID,
    proposal_id: UUID,
    payload: BulkProposalEdit,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> BulkProposalOut:
    await _owned_proposal(account_id, job_id, proposal_id, identity, session)
    if identity.user_id is None:
        raise HTTPException(status_code=403, detail="user_identity_required")
    changes = payload.changes()
    if not changes:
        raise HTTPException(status_code=422, detail="no_changes")
    try:
        proposal = await BulkRepository(session).edit_proposal(
            proposal_id,
            actor_user_id=identity.user_id,
            changes=changes,
        )
        await session.commit()
    except (BulkStateError, ValueError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return BulkProposalOut.model_validate(proposal)


@router.patch(
    "/{job_id}/clusters/{cluster_id}",
    response_model=BulkClusterEditOut,
)
async def edit_bulk_cluster(
    account_id: UUID,
    job_id: UUID,
    cluster_id: str,
    payload: BulkProposalEdit,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> BulkClusterEditOut:
    await _owned_source_job(account_id, job_id, identity, session)
    if identity.user_id is None:
        raise HTTPException(status_code=403, detail="user_identity_required")
    changes = payload.changes()
    if not changes:
        raise HTTPException(status_code=422, detail="no_changes")

    repo = BulkRepository(session)
    proposals = await repo.list_proposals(job_id, limit=100000)
    selected = select_cluster_proposals(proposals, cluster_id)
    if not selected:
        raise HTTPException(status_code=404, detail="bulk_cluster_not_found")

    edited = 0
    skipped = 0
    try:
        for proposal in selected:
            if proposal.status != "proposed":
                skipped += 1
                continue
            await repo.edit_proposal(
                proposal.id,
                actor_user_id=identity.user_id,
                changes=changes,
            )
            edited += 1
        await session.commit()
    except (BulkStateError, ValueError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return BulkClusterEditOut(edited=edited, skipped=skipped)


@router.post(
    "/{job_id}/proposals/{proposal_id}/exclude", response_model=BulkProposalOut
)
async def exclude_bulk_proposal(
    account_id: UUID,
    job_id: UUID,
    proposal_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> BulkProposalOut:
    await _owned_proposal(account_id, job_id, proposal_id, identity, session)
    if identity.user_id is None:
        raise HTTPException(status_code=403, detail="user_identity_required")
    try:
        proposal = await BulkRepository(session).exclude_proposal(
            proposal_id, actor_user_id=identity.user_id
        )
        await session.commit()
    except BulkStateError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return BulkProposalOut.model_validate(proposal)


@router.post(
    "/{job_id}/proposals/{proposal_id}/approve", response_model=BulkProposalOut
)
async def approve_bulk_proposal(
    account_id: UUID,
    job_id: UUID,
    proposal_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> BulkProposalOut:
    await _owned_proposal(account_id, job_id, proposal_id, identity, session)
    if identity.user_id is None:
        raise HTTPException(status_code=403, detail="user_identity_required")
    try:
        proposal = await BulkRepository(session).approve_proposal(
            proposal_id, actor_user_id=identity.user_id
        )
        await session.commit()
    except BulkStateError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return BulkProposalOut.model_validate(proposal)


@router.post("/{job_id}/approve-safe", response_model=BulkApproveAllOut)
async def approve_all_safe_bulk_proposals(
    account_id: UUID,
    job_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> BulkApproveAllOut:
    await _owned_source_job(account_id, job_id, identity, session)
    if identity.user_id is None:
        raise HTTPException(status_code=403, detail="user_identity_required")
    approved = await BulkRepository(session).approve_all_safe(
        job_id, actor_user_id=identity.user_id
    )
    await session.commit()
    return BulkApproveAllOut(approved=approved)


@router.post(
    "/{job_id}/clusters/{cluster_id}/approve",
    response_model=BulkClusterApproveOut,
)
async def approve_bulk_cluster(
    account_id: UUID,
    job_id: UUID,
    cluster_id: str,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> BulkClusterApproveOut:
    await _owned_source_job(account_id, job_id, identity, session)
    if identity.user_id is None:
        raise HTTPException(status_code=403, detail="user_identity_required")

    repo = BulkRepository(session)
    proposals = await repo.list_proposals(job_id, limit=100000)
    selected = select_cluster_proposals(proposals, cluster_id)
    if not selected:
        raise HTTPException(status_code=404, detail="bulk_cluster_not_found")

    approved = 0
    blocked = 0
    try:
        for proposal in selected:
            if proposal.status != "proposed":
                continue
            snapshot = repo.effective_snapshot(proposal)
            if bool(snapshot.get("suspicious_content")):
                blocked += 1
                continue
            if bool(snapshot.get("review_required")):
                confirmed = dict(snapshot)
                confirmed["review_required"] = False
                confirmed["human_confirmed"] = True
                proposal.edited_snapshot = confirmed
                proposal.updated_at = datetime.now(tz=UTC)
                await session.flush()
            await repo.approve_proposal(
                proposal.id,
                actor_user_id=identity.user_id,
            )
            approved += 1
        await session.commit()
    except BulkStateError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return BulkClusterApproveOut(approved=approved, blocked_suspicious=blocked)


@router.post(
    "/{job_id}/apply",
    response_model=BulkApplyControlOut,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_bulk_apply(
    account_id: UUID,
    job_id: UUID,
    payload: BulkApplyCreate,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> BulkApplyControlOut:
    source_job = await _owned_source_job(account_id, job_id, identity, session)
    if source_job.state != "completed":
        raise HTTPException(status_code=409, detail="source_job_not_completed")
    if identity.user_id is None:
        raise HTTPException(status_code=403, detail="user_identity_required")
    try:
        apply_job = await BulkRepository(session).create_apply_job(
            source_job_id=job_id,
            account_id=account_id,
            batch_size=payload.batch_size,
            actor_user_id=identity.user_id,
        )
        await session.commit()
    except BulkStateError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    enqueued = await _enqueue_apply(apply_job.id)
    if not enqueued:
        apply_job.state = "paused"
        apply_job.last_error = "apply_enqueue_failed"
        await session.commit()
    return BulkApplyControlOut(
        job=BulkApplyJobOut.model_validate(apply_job), enqueued=enqueued
    )


@router.get("/{job_id}/apply", response_model=BulkApplyJobOut)
async def get_bulk_apply(
    account_id: UUID,
    job_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> BulkApplyJobOut:
    await _owned_source_job(account_id, job_id, identity, session)
    apply_job = await BulkRepository(session).apply_job_for_source(job_id)
    if apply_job is None:
        raise HTTPException(status_code=404, detail="bulk_apply_not_found")
    return BulkApplyJobOut.model_validate(apply_job)
