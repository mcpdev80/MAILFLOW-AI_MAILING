"""Unified mailbox helpers that resolve standard folder roles per account."""

from __future__ import annotations

from email.utils import parsedate_to_datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity
from app.mail_client_schemas import InboxMessage, MailboxCounter
from app.mailbox_access import access_condition
from app.models.email_account import EmailAccount
from app.services.mail_actions import mailbox_metadata
from app.services.mail_client import list_authorized_inbox

_ROLE_ALIASES = {
    "inbox": {"inbox"},
    "sent": {"sent", "sentitems", "sentmail"},
    "drafts": {"drafts", "draft"},
    "trash": {"trash", "deleted", "deleteditems"},
    "spam": {"spam", "junk"},
    "archive": {"archive", "all"},
}


def _date_key(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return parsedate_to_datetime(value).timestamp()
    except (TypeError, ValueError, OverflowError):
        return 0.0


def _role_matches(actual: str | None, requested: str) -> bool:
    if actual is None:
        return False
    normalized = actual.replace("_", "").replace("-", "").lower()
    aliases = _ROLE_ALIASES.get(requested, {requested})
    return normalized in aliases


async def list_unified_by_role(
    session: AsyncSession,
    identity: RequestIdentity,
    *,
    folder_role: str,
    limit: int,
) -> tuple[list[InboxMessage], list[MailboxCounter], dict[str, int]]:
    query = select(EmailAccount).where(
        access_condition(identity), EmailAccount.is_active.is_(True)
    )
    accounts = list((await session.execute(query)).scalars())
    messages: list[InboxMessage] = []
    counters: list[MailboxCounter] = []
    cursors: dict[str, int] = {}

    for account in accounts:
        _capabilities, folders = await mailbox_metadata(
            session,
            identity,
            account_id=account.id,
        )
        target = next(
            (
                item.name
                for item in folders
                if item.selectable and _role_matches(item.role, folder_role)
            ),
            None,
        )
        if target is None:
            continue
        account_messages, account_counters, account_cursors = await list_authorized_inbox(
            session,
            identity,
            account_id=account.id,
            folder=target,
            limit=limit,
        )
        messages.extend(account_messages)
        counters.extend(account_counters)
        cursors.update(account_cursors)

    messages.sort(key=lambda item: _date_key(item.date), reverse=True)
    return messages[:limit], counters, cursors
