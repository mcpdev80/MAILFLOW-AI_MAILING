"""Mailbox lifecycle operations and compact meaningful audit events."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email_account import EmailAccount
from app.models.lifecycle_event import LifecycleEvent
from app.models.mailbox_access import MailboxAccess

_SENSITIVE_DETAIL_KEYS = {
    "body",
    "body_html",
    "body_text",
    "content",
    "credential",
    "credentials",
    "password",
    "prompt",
    "raw",
    "secret",
    "token",
}


def _compact_details(details: dict[str, Any] | None) -> dict[str, Any]:
    """Keep event details bounded and reject obviously sensitive payload fields."""
    if not details:
        return {}
    compact: dict[str, Any] = {}
    for index, (key, value) in enumerate(details.items()):
        if index >= 20:
            break
        normalized = str(key).strip().lower()
        if normalized in _SENSITIVE_DETAIL_KEYS:
            continue
        if isinstance(value, str):
            compact[str(key)[:64]] = value[:500]
        elif value is None or isinstance(value, (bool, int, float)):
            compact[str(key)[:64]] = value
        elif isinstance(value, (list, tuple)):
            compact[str(key)[:64]] = [str(item)[:100] for item in value[:20]]
        else:
            compact[str(key)[:64]] = str(value)[:500]
    return compact


async def record_lifecycle_event(
    session: AsyncSession,
    *,
    org_id: UUID,
    event: str,
    account_id: UUID | None = None,
    actor_user_id: str | None = None,
    actor_type: str | None = None,
    status: str = "success",
    message_ref: str | None = None,
    details: dict[str, Any] | None = None,
) -> LifecycleEvent:
    """Persist one compact audit event without copying mailbox content."""
    resolved_actor_type = actor_type or ("user" if actor_user_id else "system")
    if resolved_actor_type not in {"system", "user", "admin"}:
        raise ValueError("unsupported_audit_actor_type")
    if status not in {"success", "blocked", "failed", "cancelled", "info"}:
        raise ValueError("unsupported_audit_status")
    row = LifecycleEvent(
        org_id=org_id,
        account_id=account_id,
        actor_user_id=actor_user_id,
        message_ref=message_ref[:255] if message_ref else None,
        event=event[:64],
        actor_type=resolved_actor_type,
        status=status,
        details=_compact_details(details),
    )
    session.add(row)
    return row


async def disable_mailbox(
    session: AsyncSession,
    account: EmailAccount,
    *,
    actor_user_id: str | None,
) -> None:
    """Stop future processing while preserving credentials and local state."""
    account.is_active = False
    await record_lifecycle_event(
        session,
        org_id=account.org_id,
        account_id=account.id,
        actor_user_id=actor_user_id,
        event="mailbox_disabled",
    )


async def disconnect_mailbox(
    session: AsyncSession,
    account: EmailAccount,
    *,
    actor_user_id: str | None,
) -> None:
    """Stop processing and remove local credentials without deleting provider mail."""
    account.is_active = False
    account.encrypted_credentials = None
    account.encrypted_oauth = None
    await record_lifecycle_event(
        session,
        org_id=account.org_id,
        account_id=account.id,
        actor_user_id=actor_user_id,
        event="mailbox_disconnected",
    )


async def delete_mailbox_local_state(
    session: AsyncSession,
    account: EmailAccount,
    *,
    actor_user_id: str | None,
) -> None:
    """Delete MailFlow-owned state only; never issue provider-side message deletion."""
    account.is_active = False
    account.encrypted_credentials = None
    account.encrypted_oauth = None
    await record_lifecycle_event(
        session,
        org_id=account.org_id,
        account_id=account.id,
        actor_user_id=actor_user_id,
        event="mailbox_deleted",
    )
    await session.flush()
    await session.delete(account)


async def private_mailboxes_owned_by(
    session: AsyncSession,
    *,
    org_id: UUID,
    user_id: str,
) -> list[EmailAccount]:
    rows = await session.execute(
        select(EmailAccount).where(
            EmailAccount.org_id == org_id,
            EmailAccount.ownership_mode == "private",
            EmailAccount.owner_user_id == user_id,
        )
    )
    return list(rows.scalars())


async def prepare_user_removal(
    session: AsyncSession,
    *,
    org_id: UUID,
    user_id: str,
    action: str,
    actor_user_id: str | None,
    target_user_id: str | None = None,
) -> int:
    """Resolve private mailbox ownership before organization membership removal."""
    accounts = await private_mailboxes_owned_by(session, org_id=org_id, user_id=user_id)

    if action == "transfer":
        if not target_user_id:
            raise ValueError("target_user_id_required")
        for account in accounts:
            account.owner_user_id = target_user_id
    elif action == "disable":
        for account in accounts:
            account.is_active = False
            account.owner_user_id = None
            account.ownership_mode = "unresolved"
    elif action == "delete_local":
        for account in accounts:
            await delete_mailbox_local_state(
                session,
                account,
                actor_user_id=actor_user_id,
            )
    else:
        raise ValueError("unsupported_user_removal_action")

    await session.execute(
        delete(MailboxAccess).where(
            MailboxAccess.user_id == user_id,
            MailboxAccess.account_id.in_(
                select(EmailAccount.id).where(EmailAccount.org_id == org_id)
            ),
        )
    )
    await record_lifecycle_event(
        session,
        org_id=org_id,
        actor_user_id=actor_user_id,
        actor_type="admin",
        event="user_removal_prepared",
        details={"action": action, "resolved_mailboxes": len(accounts)},
    )
    return len(accounts)


async def finalize_removed_member(
    session: AsyncSession,
    *,
    org_id: UUID,
    user_id: str,
) -> None:
    """Remove residual mailbox grants after Better Auth membership deletion."""
    owned = await private_mailboxes_owned_by(session, org_id=org_id, user_id=user_id)
    if owned:
        raise RuntimeError("private_mailboxes_require_resolution")

    await session.execute(
        delete(MailboxAccess).where(
            MailboxAccess.user_id == user_id,
            MailboxAccess.account_id.in_(
                select(EmailAccount.id).where(EmailAccount.org_id == org_id)
            ),
        )
    )
    await record_lifecycle_event(
        session,
        org_id=org_id,
        actor_user_id=user_id,
        actor_type="admin",
        event="user_removed",
    )


async def purge_expired_lifecycle_events(
    session: AsyncSession,
    *,
    retention_days: int,
    batch_size: int,
) -> int:
    """Delete expired compact events in a bounded batch."""
    cutoff = datetime.now(tz=UTC) - timedelta(days=retention_days)
    ids = list(
        (
            await session.execute(
                select(LifecycleEvent.id)
                .where(LifecycleEvent.created_at < cutoff)
                .order_by(LifecycleEvent.created_at)
                .limit(batch_size)
            )
        ).scalars()
    )
    if not ids:
        return 0
    await session.execute(delete(LifecycleEvent).where(LifecycleEvent.id.in_(ids)))
    return len(ids)
