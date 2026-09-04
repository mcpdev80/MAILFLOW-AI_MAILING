"""Mailbox-authorized view of global model workload state."""

from __future__ import annotations

import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity, require_identity
from app.database import get_session
from app.mailbox_access import get_accessible_account
from app.workload import get_workload_controller

router = APIRouter(
    prefix="/accounts/{account_id}/workload-health",
    tags=["workload-health"],
)


@router.get("")
async def get_workload_health(
    account_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    """Return content-free global model queue/capacity metrics."""
    await get_accessible_account(account_id, identity, session)
    snapshot = await asyncio.to_thread(get_workload_controller().snapshot)
    snapshot["account_id"] = str(account_id)
    return snapshot
