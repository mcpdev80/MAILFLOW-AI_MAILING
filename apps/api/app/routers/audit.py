"""Authorized compact activity history for one mailbox."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_schemas import AuditEventOut
from app.auth import RequestIdentity, require_identity
from app.database import get_session
from app.mailbox_access import get_accessible_account
from app.models.lifecycle_event import LifecycleEvent

router = APIRouter(prefix="/accounts/{account_id}/activity", tags=["activity"])


@router.get("", response_model=list[AuditEventOut])
async def list_activity(
    account_id: UUID,
    limit: int = Query(default=100, ge=1, le=500),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[LifecycleEvent]:
    """Return newest meaningful events without message bodies or model traces."""
    await get_accessible_account(account_id, identity, session)
    rows = await session.execute(
        select(LifecycleEvent)
        .where(LifecycleEvent.account_id == account_id)
        .order_by(LifecycleEvent.created_at.desc())
        .limit(limit)
    )
    return list(rows.scalars())
