"""CRUD endpoints for email accounts with mailbox-level authorization."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity, require_identity, require_recent_auth
from app.crypto import encrypt_secret
from app.database import get_session
from app.mailbox_access import (
    OWNERSHIP_PRIVATE,
    OWNERSHIP_SHARED,
    OWNERSHIP_UNRESOLVED,
    SHARED_ADMIN_ROLES,
    access_condition,
    ensure_org_members,
    get_accessible_account,
    get_account_for_management,
    new_account_ownership,
    replace_shared_access,
)
from app.models.email_account import EmailAccount
from app.models.mailbox_access import MailboxAccess
from app.quota import can_add_account
from app.schemas import (
    EmailAccountCreate,
    EmailAccountOut,
    EmailAccountUpdate,
    MailboxOwnershipUpdate,
    SharedMailboxAccessOut,
    SharedMailboxAccessReplace,
)

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
    if ownership_mode != OWNERSHIP_SHARED and payload.shared_user_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="shared_users_require_shared_mailbox",
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
        encrypted_credentials=encrypt_secret({"password": payload.password}),
        inbox_folder=payload.inbox_folder,
        unclassified_folder=payload.unclassified_folder,
        drafts_folder=payload.drafts_folder,
        smtp_host=payload.smtp_host,
        smtp_port=payload.smtp_port,
        smtp_security=payload.smtp_security,
        smtp_username=payload.smtp_username,
        interval_minutes=payload.interval_minutes,
        llm_provider_id=payload.llm_provider_id,
        move_policy=payload.move_policy,
        archive_policy=payload.archive_policy,
        action_confidence_threshold=payload.action_confidence_threshold,
    )
    session.add(account)
    await session.flush()

    if ownership_mode == OWNERSHIP_SHARED:
        await replace_shared_access(
            session,
            account,
            identity,
            payload.shared_user_ids,
            manager_user_id=identity.user_id,
        )

    await session.commit()
    await session.refresh(account)
    return account


@router.get("/unresolved-mailboxes", response_model=list[EmailAccountOut])
async def list_unresolved_mailboxes(
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[EmailAccount]:
    """List legacy mailbox metadata that still needs an ownership decision."""
    if identity.user_id is not None and identity.role not in SHARED_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="organization_admin_required")
    rows = await session.execute(
        select(EmailAccount)
        .where(
            EmailAccount.org_id == identity.org.id,
            EmailAccount.ownership_mode == OWNERSHIP_UNRESOLVED,
        )
        .order_by(EmailAccount.created_at)
    )
    return list(rows.scalars())


@router.get("/managed-mailboxes", response_model=list[EmailAccountOut])
async def list_managed_mailboxes(
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[EmailAccount]:
    """List shared mailbox metadata the actor may manage without content access."""
    if identity.user_id is None:
        return []
    rows = await session.execute(
        select(EmailAccount)
        .join(MailboxAccess, MailboxAccess.account_id == EmailAccount.id)
        .where(
            EmailAccount.org_id == identity.org.id,
            EmailAccount.ownership_mode == OWNERSHIP_SHARED,
            MailboxAccess.user_id == identity.user_id,
            MailboxAccess.can_manage.is_(True),
        )
        .order_by(EmailAccount.created_at)
    )
    return list(rows.scalars())


@router.get("/{account_id}/management", response_model=EmailAccountOut)
async def get_managed_account(
    account_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> EmailAccount:
    return await get_account_for_management(account_id, identity, session)


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
    account = await get_account_for_management(account_id, identity, session)
    data = payload.model_dump(exclude_unset=True)
    password = data.pop("password", None)
    if password:
        account.encrypted_credentials = encrypt_secret({"password": password})
    for field, value in data.items():
        setattr(account, field, value)
    await session.commit()
    await session.refresh(account)
    return account


@router.get("/{account_id}/access", response_model=list[SharedMailboxAccessOut])
async def list_shared_access(
    account_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[MailboxAccess]:
    account = await get_account_for_management(account_id, identity, session)
    if account.ownership_mode != OWNERSHIP_SHARED:
        raise HTTPException(status_code=409, detail="mailbox_not_shared")
    rows = await session.execute(
        select(MailboxAccess)
        .where(MailboxAccess.account_id == account.id)
        .order_by(MailboxAccess.user_id)
    )
    return list(rows.scalars())


@router.put("/{account_id}/access", response_model=list[SharedMailboxAccessOut])
async def replace_shared_mailbox_access(
    account_id: UUID,
    payload: SharedMailboxAccessReplace,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[MailboxAccess]:
    account = await get_account_for_management(account_id, identity, session)
    require_recent_auth(identity)
    if account.ownership_mode != OWNERSHIP_SHARED:
        raise HTTPException(status_code=409, detail="mailbox_not_shared")

    await replace_shared_access(
        session,
        account,
        identity,
        payload.user_ids,
        manager_user_id=identity.user_id,
    )
    await session.commit()
    rows = await session.execute(
        select(MailboxAccess)
        .where(MailboxAccess.account_id == account.id)
        .order_by(MailboxAccess.user_id)
    )
    return list(rows.scalars())


@router.put("/{account_id}/ownership", response_model=EmailAccountOut)
async def change_mailbox_ownership(
    account_id: UUID,
    payload: MailboxOwnershipUpdate,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> EmailAccount:
    account = await get_account_for_management(account_id, identity, session)
    require_recent_auth(identity)

    if identity.user_id is None:
        if payload.mode != OWNERSHIP_SHARED:
            raise HTTPException(
                status_code=400, detail="private_mailbox_requires_user_auth"
            )
        account.ownership_mode = OWNERSHIP_SHARED
        account.owner_user_id = None
        await session.execute(
            delete(MailboxAccess).where(MailboxAccess.account_id == account.id)
        )
        await session.commit()
        await session.refresh(account)
        return account

    if payload.mode == OWNERSHIP_PRIVATE:
        if payload.shared_user_ids:
            raise HTTPException(
                status_code=422, detail="shared_users_require_shared_mailbox"
            )
        target_user = payload.target_owner_user_id or identity.user_id
        await ensure_org_members(session, identity, [target_user])
        account.ownership_mode = OWNERSHIP_PRIVATE
        account.owner_user_id = target_user
        await session.execute(
            delete(MailboxAccess).where(MailboxAccess.account_id == account.id)
        )
    else:
        if payload.target_owner_user_id is not None:
            raise HTTPException(
                status_code=422, detail="shared_mailbox_has_no_private_owner"
            )
        account.ownership_mode = OWNERSHIP_SHARED
        account.owner_user_id = None
        await replace_shared_access(
            session,
            account,
            identity,
            payload.shared_user_ids,
            manager_user_id=identity.user_id,
        )

    await session.commit()
    await session.refresh(account)
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> None:
    account = await get_account_for_management(account_id, identity, session)
    require_recent_auth(identity)
    await session.delete(account)
    await session.commit()
