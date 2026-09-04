"""Explicit mailbox and membership lifecycle operations."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity, require_identity, require_recent_auth
from app.database import get_session
from app.lifecycle import (
    delete_mailbox_local_state,
    disable_mailbox,
    disconnect_mailbox,
    prepare_user_removal,
)
from app.mailbox_access import SHARED_ADMIN_ROLES, ensure_org_members, get_account_for_management
from app.models.email_account import EmailAccount
from app.schemas import EmailAccountOut, UserRemovalPrepare, UserRemovalPrepareOut

router = APIRouter(prefix="/lifecycle", tags=["lifecycle"])


@router.post("/accounts/{account_id}/disable", response_model=EmailAccountOut)
async def disable_account_processing(
    account_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> EmailAccount:
    account = await get_account_for_management(account_id, identity, session)
    await disable_mailbox(session, account, actor_user_id=identity.user_id)
    await session.commit()
    await session.refresh(account)
    return account


@router.post("/accounts/{account_id}/disconnect", response_model=EmailAccountOut)
async def disconnect_account_credentials(
    account_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> EmailAccount:
    account = await get_account_for_management(account_id, identity, session)
    require_recent_auth(identity)
    await disconnect_mailbox(session, account, actor_user_id=identity.user_id)
    await session.commit()
    await session.refresh(account)
    return account


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account_local_state(
    account_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> None:
    account = await get_account_for_management(account_id, identity, session)
    require_recent_auth(identity)
    await delete_mailbox_local_state(session, account, actor_user_id=identity.user_id)
    await session.commit()


@router.post(
    "/users/{user_id}/prepare-removal",
    response_model=UserRemovalPrepareOut,
)
async def prepare_member_removal(
    user_id: str,
    payload: UserRemovalPrepare,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> UserRemovalPrepareOut:
    if identity.user_id is None or identity.role not in SHARED_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="organization_admin_required")
    require_recent_auth(identity)

    if user_id == identity.user_id:
        raise HTTPException(status_code=409, detail="self_removal_requires_separate_flow")

    if payload.action == "transfer":
        if not payload.target_user_id:
            raise HTTPException(status_code=422, detail="target_user_id_required")
        if payload.target_user_id == user_id:
            raise HTTPException(status_code=422, detail="target_owner_must_differ")
        await ensure_org_members(session, identity, [payload.target_user_id])

    try:
        count = await prepare_user_removal(
            session,
            org_id=identity.org.id,
            user_id=user_id,
            action=payload.action,
            actor_user_id=identity.user_id,
            target_user_id=payload.target_user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    await session.commit()
    return UserRemovalPrepareOut(owned_mailboxes_resolved=count)
