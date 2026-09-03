"""Mailbox ownership and authorization helpers.

Private mailboxes are visible only to their Better Auth owner. Organization
owner/admin roles do not override this boundary. Shared mailboxes remain visible
to members of the organization through the authenticated BFF path.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.auth import RequestIdentity
from app.models.email_account import EmailAccount

OWNERSHIP_PRIVATE = "private"
OWNERSHIP_SHARED = "shared"
OWNERSHIP_UNRESOLVED = "unresolved"


def access_condition(identity: RequestIdentity) -> ColumnElement[bool]:
    """Return the SQL predicate for mailboxes visible to ``identity``.

    Legacy single-tenant mode intentionally keeps its existing organization-wide
    behavior because there is no Better Auth user identity in that mode.

    In multi-user mode unresolved legacy ownership is excluded. This is a
    fail-safe migration state: an ambiguous old mailbox must never become shared
    merely because ``owner_user_id`` is NULL.
    """
    org_condition = EmailAccount.org_id == identity.org.id
    if identity.user_id is None:
        return org_condition

    return and_(
        org_condition,
        or_(
            and_(
                EmailAccount.ownership_mode == OWNERSHIP_PRIVATE,
                EmailAccount.owner_user_id == identity.user_id,
            ),
            EmailAccount.ownership_mode == OWNERSHIP_SHARED,
        ),
    )


async def get_accessible_account(
    account_id: UUID,
    identity: RequestIdentity,
    session: AsyncSession,
) -> EmailAccount:
    """Load an account only when the current actor may access it.

    Return 404 rather than 403 so account identifiers cannot be used to probe
    the existence of another user's private mailbox.
    """
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
        return OWNERSHIP_SHARED, None
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="invalid_ownership_mode",
    )
