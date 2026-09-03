"""Processing-cycle endpoints with mailbox-level authorization."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity, require_identity
from app.config import settings
from app.database import get_session
from app.mailbox_access import get_accessible_account
from app.models.audit_log import AuditLog
from app.schemas import CycleEnqueuedOut, CycleOut

logger = logging.getLogger("mailflow.api")

router = APIRouter(prefix="/accounts/{account_id}/cycles", tags=["cycles"])


@router.get("", response_model=list[CycleOut])
async def list_cycles(
    account_id: UUID,
    limit: int = Query(default=20, ge=1, le=100),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[AuditLog]:
    """Return cycle history for an authorized mailbox."""
    await get_accessible_account(account_id, identity, session)
    rows = await session.execute(
        select(AuditLog)
        .where(AuditLog.account_id == account_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    return list(rows.scalars())


@router.post(
    "/run", response_model=CycleEnqueuedOut, status_code=status.HTTP_202_ACCEPTED
)
async def run_cycle_now(
    account_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> CycleEnqueuedOut:
    """Enqueue an immediate processing cycle for an authorized mailbox."""
    await get_accessible_account(account_id, identity, session)

    job_id = f"cycle-{account_id}"
    try:
        from arq.connections import RedisSettings, create_pool

        pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
        try:
            job = await pool.enqueue_job(
                "process_account_cycle", str(account_id), _job_id=job_id
            )
        finally:
            await pool.close()
        return CycleEnqueuedOut(
            account_id=account_id,
            enqueued=job is not None,
            job_id=job_id,
        )
    except Exception as exc:  # noqa: BLE001 - Redis must not break the request
        logger.warning("could not enqueue cycle for %s: %s", account_id, exc)
        return CycleEnqueuedOut(account_id=account_id, enqueued=False, job_id=None)
