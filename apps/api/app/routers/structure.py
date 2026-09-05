"""Mailbox-scoped smart folder/tag setup endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity, require_identity
from app.database import async_session_factory, get_session
from app.mailbox_access import get_account_for_management
from app.services.mailbox_structure import MailboxStructureService
from app.structure_schemas import StructureApply, StructureApplyOut

router = APIRouter(
    prefix="/accounts/{account_id}/structure",
    tags=["mailbox-structure"],
)


@router.get("/proposal")
async def propose_mailbox_structure(
    account_id: UUID,
    locale: str = Query(default="en", pattern=r"^(de|en|es)$"),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    await get_account_for_management(account_id, identity, session)
    try:
        result = await MailboxStructureService(async_session_factory).discover(
            account_id, locale=locale
        )
    except Exception as exc:  # provider errors stay explicit but content-free
        raise HTTPException(
            status_code=502,
            detail=f"mailbox_structure_discovery_failed:{type(exc).__name__}",
        ) from exc
    return result.proposal


@router.post("/apply", response_model=StructureApplyOut)
async def apply_mailbox_structure(
    account_id: UUID,
    payload: StructureApply,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> StructureApplyOut:
    await get_account_for_management(account_id, identity, session)
    if identity.user_id is None:
        raise HTTPException(status_code=403, detail="user_identity_required")
    try:
        result = await MailboxStructureService(async_session_factory).apply(
            account_id,
            payload,
            actor_user_id=identity.user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"mailbox_structure_apply_failed:{type(exc).__name__}",
        ) from exc
    return StructureApplyOut(**result)
