"""Mailbox ownership, sharing and authorization helpers.

Private mailboxes are visible only to their Better Auth owner. Shared mailboxes
use explicit per-user grants; organization membership or admin status alone does
not grant mailbox-content access.
"""

from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, exists, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.auth import RequestIdentity
from app.models.email_account import EmailAccount
from app.models.mailbox_access import MailboxAccess

OWNERSHIP_PRIVATE = "private"
OWNERSHIP_SHARED = "shared"
OWNERSHIP_UNRESOLVED = "unresolved"
SHARED_ADMIN_ROLES = frozenset({"owner", "admin"})


def access_condition(identity: RequestIdentity) -> ColumnElement[bool]:
    """Return the SQL predicate for mailboxes visible to ``identity``.

    Legacy single-tenant mode keeps organization-wide behavior because there is
    no Better Auth user identity. In multi-user mode unresolved legacy ownership
    is excluded and shared access requires an explicit ``can_use`` grant.
    """
    org_condition = EmailAccount.org_id == identity.org.id
    if identity.user_id is None:
        return org_condition

    shared_grant = exists(
        select(MailboxAccess.id).where(
            MailboxAccess.account_id == EmailAccount.id,
            MailboxAccess.user_id == identity.user_id,
            MailboxAccess.can_use.is_(True),
        )
    )
    return and_(
        org_condition,
        or_(
            and_(
                EmailAccount.ownership_mode == OWNERSHIP_PRIVATE,
                EmailAccount.owner_user_id == identity.user_id,
            ),
            and_(
                EmailAccount.ownership_mode == OWNERSHIP_SHARED,
                shared_grant,
            ),
        ),
    )


async def get_accessible_account(
    account_id: UUID,
    identity: RequestIdentity,
    session: AsyncSession,
) -> EmailAccount:
    """Load an account only when the current actor may use its mailbox data."""
    account = (
        await session.execute(
            select(EmailAccount).where(
                EmailAccount.id == account_id,
                access_condition(identity),
            )
        )
    ).scalar_one_or_none()
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="account_not_found",
        )
    return account


async def get_account_for_management(
    account_id: UUID,
    identity: RequestIdentity,
    session: AsyncSession,
) -> EmailAccount:
    """Load a mailbox when the actor may change ownership/sharing metadata.

    Private mailboxes are manageable only by their owner. Shared mailboxes need
    an explicit ``can_manage`` grant. Unresolved legacy mailboxes can be resolved
    by an organization owner/admin without granting that actor content access.
    """
    account = (
        await session.execute(
            select(EmailAccount).where(
                EmailAccount.id == account_id,
                EmailAccount.org_id == identity.org.id,
            )
        )
    ).scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="account_not_found")

    if identity.user_id is None:
        return account

    if (
        account.ownership_mode == OWNERSHIP_PRIVATE
        and account.owner_user_id == identity.user_id
    ):
        return account

    if account.ownership_mode == OWNERSHIP_UNRESOLVED:
        if identity.role in SHARED_ADMIN_ROLES:
            return account
        raise HTTPException(status_code=404, detail="account_not_found")

    if account.ownership_mode == OWNERSHIP_SHARED:
        grant = (
            await session.execute(
                select(MailboxAccess.id).where(
                    MailboxAccess.account_id == account.id,
                    MailboxAccess.user_id == identity.user_id,
                    MailboxAccess.can_manage.is_(True),
                )
            )
        ).scalar_one_or_none()
        if grant is not None:
            return account

    raise HTTPException(status_code=404, detail="account_not_found")


def new_account_ownership(
    identity: RequestIdentity,
    requested_mode: str | None,
) -> tuple[str, str | None]:
    """Resolve safe ownership defaults for a newly connected mailbox."""
    if identity.user_id is None:
        if requested_mode == OWNERSHIP_PRIVATE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="private_mailbox_requires_user_auth",
            )
        return OWNERSHIP_SHARED, None

    mode = requested_mode or OWNERSHIP_PRIVATE
    if mode == OWNERSHIP_PRIVATE:
        return OWNERSHIP_PRIVATE, identity.user_id
    if mode == OWNERSHIP_SHARED:
        if identity.role not in SHARED_ADMIN_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="shared_mailbox_admin_required",
            )
        return OWNERSHIP_SHARED, None
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="invalid_ownership_mode",
    )


async def ensure_org_members(
    session: AsyncSession,
    identity: RequestIdentity,
    user_ids: Iterable[str],
) -> set[str]:
    """Validate Better Auth user ids against the actor's active organization.

    Better Auth owns these tables, so MailFlow intentionally queries the small
    membership boundary directly instead of declaring cross-application ORM FKs.
    """
    requested = {user_id for user_id in user_ids if user_id}
    if not requested:
        return set()
    if identity.user_id is None:
        return requested
    if not identity.auth_org_id:
        raise HTTPException(status_code=401, detail="invalid_actor_identity")

    rows = await session.execute(
        text(
            'SELECT "userId" FROM "member" '
            'WHERE "organizationId" = :organization_id'
        ),
        {"organization_id": identity.auth_org_id},
    )
    members = {str(row[0]) for row in rows}
    if not requested.issubset(members):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="shared_user_not_organization_member",
        )
    return requested


async def replace_shared_access(
    session: AsyncSession,
    account: EmailAccount,
    identity: RequestIdentity,
    user_ids: Iterable[str],
    *,
    manager_user_id: str | None = None,
) -> None:
    """Replace content access grants while preserving one explicit manager.

    ``manager_user_id`` may manage sharing without being included in ``user_ids``;
    this prevents shared-mailbox creation from implicitly exposing mail content to
    the organization admin who created it.
    """
    users = await ensure_org_members(session, identity, user_ids)
    manager = manager_user_id or identity.user_id
    if manager:
        await ensure_org_members(session, identity, [manager])

    existing = list(
        (
            await session.execute(
                select(MailboxAccess).where(MailboxAccess.account_id == account.id)
            )
        ).scalars()
    )
    by_user = {grant.user_id: grant for grant in existing}
    desired = set(users)
    if manager:
        desired.add(manager)

    for user_id in desired:
        grant = by_user.pop(user_id, None)
        if grant is None:
            grant = MailboxAccess(account_id=account.id, user_id=user_id)
            session.add(grant)
        grant.can_use = user_id in users
        grant.can_manage = user_id == manager or grant.can_manage

    for grant in by_user.values():
        await session.delete(grant)
