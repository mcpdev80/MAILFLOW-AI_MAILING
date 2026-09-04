"""Mailbox-scoped inference health endpoint."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity, require_identity
from app.database import get_session
from app.inference_health import read_inference_health
from app.mailbox_access import get_accessible_account

logger = logging.getLogger("mailflow.api")

router = APIRouter(
    prefix="/accounts/{account_id}/inference-health",
    tags=["inference-health"],
)


@router.get("")
async def get_inference_health(
    account_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    """Return the latest worker-published model health for an authorized mailbox."""
    await get_accessible_account(account_id, identity, session)
    try:
        snapshot = await read_inference_health(account_id)
    except Exception as exc:  # noqa: BLE001 - health visibility must degrade safely
        logger.warning(
            "Could not read inference health for account=%s: %s",
            account_id,
            type(exc).__name__,
        )
        snapshot = None

    if snapshot is None:
        return {
            "account_id": str(account_id),
            "status": "unknown",
            "degraded": False,
            "updated_at": None,
            "paths": {},
        }
    return snapshot
