"""Explicit user-controlled mailbox actions with provider capability checks."""

from __future__ import annotations

import asyncio
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity
from app.mail_client_schemas import (
    MailActionRequest,
    MailActionResult,
    MailboxCapabilities,
    MailboxFolderView,
)
from app.mailbox_access import get_accessible_account
from app.services.mail_client import _build_provider


class MailActionError(RuntimeError):
    pass


async def mailbox_metadata(
    session: AsyncSession,
    identity: RequestIdentity,
    *,
    account_id: UUID,
) -> tuple[MailboxCapabilities, list[MailboxFolderView]]:
    account = await get_accessible_account(account_id, identity, session)
    provider = await _build_provider(account)

    def load():
        provider.connect()
        try:
            capabilities = provider.capabilities()
            folders = provider.list_folders()
            return capabilities, folders
        finally:
            provider.disconnect()

    capabilities, folders = await asyncio.to_thread(load)
    return (
        MailboxCapabilities(**capabilities.__dict__),
        [
            MailboxFolderView(name=item.name, role=item.role, selectable=item.selectable)
            for item in folders
        ],
    )


async def perform_mail_action(
    session: AsyncSession,
    identity: RequestIdentity,
    *,
    account_id: UUID,
    folder: str,
    uid: int,
    request: MailActionRequest,
) -> MailActionResult:
    account = await get_accessible_account(account_id, identity, session)
    provider = await _build_provider(account)

    def apply() -> MailActionResult:
        provider.connect()
        try:
            folders = provider.list_folders()
            selectable = {item.name for item in folders if item.selectable}
            if folder not in selectable:
                raise MailActionError("folder_not_found")
            capabilities = provider.capabilities()
            action = request.action

            if action == "mark_read":
                if not capabilities.read_state:
                    raise MailActionError("action_not_supported")
                provider.set_seen(folder, uid, True)
            elif action == "mark_unread":
                if not capabilities.read_state:
                    raise MailActionError("action_not_supported")
                provider.set_seen(folder, uid, False)
            elif action == "flag":
                if not capabilities.flag:
                    raise MailActionError("action_not_supported")
                provider.set_flagged(folder, uid, True)
            elif action == "unflag":
                if not capabilities.flag:
                    raise MailActionError("action_not_supported")
                provider.set_flagged(folder, uid, False)
            elif action in {"move", "restore"}:
                if not capabilities.move:
                    raise MailActionError("action_not_supported")
                destination = (request.destination_folder or "").strip()
                if destination not in selectable:
                    raise MailActionError("destination_folder_not_found")
                if destination != folder and not provider.move_from_folder(folder, uid, destination):
                    raise MailActionError("action_failed")
                return MailActionResult(
                    action=action,
                    applied=True,
                    destination_folder=destination,
                )
            elif action == "archive":
                if not capabilities.archive:
                    raise MailActionError("action_not_supported")
                destination = next(
                    (item.name for item in folders if item.role == "archive" and item.selectable),
                    None,
                )
                if not destination:
                    raise MailActionError("action_not_supported")
                if folder != destination and not provider.archive_email(folder, uid):
                    raise MailActionError("action_failed")
                return MailActionResult(
                    action=action,
                    applied=True,
                    destination_folder=destination,
                )
            elif action == "trash":
                if not capabilities.trash:
                    raise MailActionError("action_not_supported")
                destination = next(
                    (item.name for item in folders if item.role == "trash" and item.selectable),
                    None,
                )
                if not destination:
                    raise MailActionError("action_not_supported")
                if folder != destination and not provider.trash_email(folder, uid):
                    raise MailActionError("action_failed")
                return MailActionResult(
                    action=action,
                    applied=True,
                    destination_folder=destination,
                )
            elif action == "spam":
                if not capabilities.spam:
                    raise MailActionError("action_not_supported")
                destination = next(
                    (item.name for item in folders if item.role == "spam" and item.selectable),
                    None,
                )
                if not destination:
                    raise MailActionError("action_not_supported")
                if folder != destination and not provider.mark_spam(folder, uid):
                    raise MailActionError("action_failed")
                return MailActionResult(
                    action=action,
                    applied=True,
                    destination_folder=destination,
                )
            elif action == "add_tags":
                if not capabilities.tags:
                    raise MailActionError("action_not_supported")
                provider.set_source_folder(folder)
                provider.apply_tags(uid, request.tags)
            elif action == "remove_tags":
                if not capabilities.tags:
                    raise MailActionError("action_not_supported")
                provider.remove_tags(folder, uid, request.tags)
            else:
                raise MailActionError("action_not_supported")

            return MailActionResult(action=action, applied=True)
        finally:
            provider.disconnect()

    return await asyncio.to_thread(apply)
