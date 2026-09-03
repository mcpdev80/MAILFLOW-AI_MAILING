"""CRUD endpoints for email accounts with mailbox-level authorization."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity, require_identity
from app.config import settings
from app.crypto import encrypt
from app.database import get_session
from app.mailbox_access import (
    access_condition,
    get_accessible_account,
    new_account_ownership,
)
from app.models.email_account import EmailAccount
from app.quota import can_add_account
from app.schemas import EmailAccountCreate, EmailAccountOut, EmailAccountUpdate

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[EmailAccountOut])
async def list_accounts(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[EmailAccount]:
    rows = await session.execute(
        select(EmailAccount)
        .where(access_condition(identity))
        .order_by(EmailAccount.created_at)
        .limit(limit)
        .offset(offset)
    )
    return list(rows.scalars())


@router.post("", response_model=EmailAccountOut, status_code=status.HTTP_201_CREATED)
async def create_account(
    payload: EmailAccountCreate,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> EmailAccount:
    org = identity.org
    if not await can_add_account(session, org.id, org.plan):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="account_limit_reached",
        )

    ownership_mode, owner_user_id = new_account_ownership(
        identity, payload.ownership_mode
    )
    account = EmailAccount(
        org_id=org.id,
        owner_user_id=owner_user_id,
        ownership_mode=ownership_mode,
        provider_type=payload.provider_type,
        imap_host=payload.imap_host,
        imap_port=payload.imap_port,
        use_ssl=payload.use_ssl,
        username=payload.username,
        encrypted_credentials=encrypt(
            {"password": payload.password}, settings.SECRET_KEY
        ),
        inbox_folder=payload.inbox_folder,
        unclassified_folder=payload.unclassified_folder,
        drafts_folder=payload.drafts_folder,
        interval_minutes=payload.interval_minutes,
        llm_provider_id=payload.llm_provider_id,
    )
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return account


@router.get("/{account_id}", response_model=EmailAccountOut)
async def get_account(
    account_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> EmailAccount:
    return await get_accessible_account(account_id, identity, session)


@router.patch("/{account_id}", response_model=EmailAccountOut)
async def update_account(
    account_id: UUID,
    payload: EmailAccountUpdate,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> EmailAccount:
    account = await get_accessible_account(account_id, identity, session)
    data = payload.model_dump(exclude_unset=True)
    password = data.pop("password", None)
    if password:
        account.encrypted_credentials = encrypt(
            {"password": password}, settings.SECRET_KEY
        )
    for field, value in data.items():
        setattr(account, field, value)
    await session.commit()
    await session.refresh(account)
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> None:
    account = await get_accessible_account(account_id, identity, session)
    await session.delete(account)
    await session.commit()
