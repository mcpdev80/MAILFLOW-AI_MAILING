"""Authorized provider-neutral mail-client service."""

from __future__ import annotations

import asyncio
import re
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse
from uuid import UUID

from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import oauth
from app.auth import RequestIdentity
from app.crypto import decrypt_secret
from app.mail_client_schemas import InboxMessage, MailAttachment, MessageDetail
from app.mailbox_access import access_condition, get_accessible_account
from app.models.email_account import EmailAccount
from app.models.processed_email import ProcessedEmail
from mailflow_core.providers.imap_mail_client import ImapMailClientProvider

_MAX_ATTACHMENT_DOWNLOAD = 25 * 1024 * 1024
_ALLOWED_TAGS = {
    "a",
    "p",
    "br",
    "div",
    "span",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "blockquote",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "hr",
    "pre",
    "code",
}


def sanitize_message_html(raw_html: str) -> str:
    """Return conservative HTML suitable for rendering without active/remote content."""
    soup = BeautifulSoup(raw_html or "", "html.parser")
    for tag in list(soup.find_all(True)):
        if tag.name not in _ALLOWED_TAGS:
            if tag.name in {"script", "style", "iframe", "object", "embed", "form", "svg", "math"}:
                tag.decompose()
            else:
                tag.unwrap()
            continue
        attrs: dict[str, str] = {}
        if tag.name == "a":
            href = str(tag.get("href") or "").strip()
            parsed = urlparse(href)
            if parsed.scheme.lower() in {"http", "https", "mailto"}:
                attrs["href"] = href
                attrs["rel"] = "noopener noreferrer"
                attrs["target"] = "_blank"
        tag.attrs = attrs
    return str(soup)


def _date_key(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        parsed = parsedate_to_datetime(value)
        return parsed.timestamp()
    except (TypeError, ValueError, OverflowError):
        return 0.0


async def _build_provider(account: EmailAccount) -> ImapMailClientProvider:
    password: str | None = None
    access_token: str | None = None
    if account.provider_type in {"gmail", "microsoft"} and account.encrypted_oauth:
        refresh_token = str(decrypt_secret(account.encrypted_oauth)["refresh_token"])
        access_token = await asyncio.to_thread(
            oauth.access_token_from_refresh,
            account.provider_type,
            refresh_token,
        )
    elif account.encrypted_credentials:
        password = str(decrypt_secret(account.encrypted_credentials)["password"])
    if not password and not access_token:
        raise RuntimeError("mailbox_credentials_unavailable")
    return ImapMailClientProvider(
        host=account.imap_host,
        port=account.imap_port,
        username=account.username,
        password=password,
        use_ssl=account.use_ssl,
        access_token=access_token,
    )


async def _thread_ids(
    session: AsyncSession,
    account_id: UUID,
    message_ids: list[str],
) -> dict[str, str]:
    ids = [value for value in message_ids if value]
    if not ids:
        return {}
    rows = await session.execute(
        select(ProcessedEmail.message_id, ProcessedEmail.thread_id).where(
            ProcessedEmail.account_id == account_id,
            ProcessedEmail.message_id.in_(ids),
        )
    )
    return {str(message_id): str(thread_id) for message_id, thread_id in rows if thread_id}


async def list_authorized_inbox(
    session: AsyncSession,
    identity: RequestIdentity,
    *,
    account_id: UUID | None = None,
    folder: str | None = None,
    limit: int = 50,
    before_uid: int | None = None,
) -> tuple[list[InboxMessage], dict[str, int]]:
    if limit <= 0 or limit > 100:
        raise ValueError("limit must be between 1 and 100")

    query = select(EmailAccount).where(access_condition(identity), EmailAccount.is_active.is_(True))
    if account_id is not None:
        query = query.where(EmailAccount.id == account_id)
    accounts = list((await session.execute(query)).scalars())

    messages: list[InboxMessage] = []
    next_by_account: dict[str, int] = {}
    per_account_limit = limit if len(accounts) <= 1 else min(max(limit, 20), 100)

    for account in accounts:
        provider = await _build_provider(account)

        def fetch_for_account():
            provider.connect()
            try:
                folders = provider.list_folders()
                target = folder or next(
                    (item.name for item in folders if item.role == "inbox" and item.selectable),
                    account.inbox_folder or "INBOX",
                )
                valid = {item.name for item in folders if item.selectable}
                if target not in valid:
                    raise KeyError("folder_not_found")
                return target, provider.list_messages(
                    target,
                    before_uid=before_uid,
                    limit=per_account_limit,
                )
            finally:
                provider.disconnect()

        target_folder, provider_messages = await asyncio.to_thread(fetch_for_account)
        thread_map = await _thread_ids(
            session,
            account.id,
            [item.message_id for item in provider_messages],
        )
        for item in provider_messages:
            messages.append(
                InboxMessage(
                    account_id=account.id,
                    account_address=account.username,
                    ownership_mode=account.ownership_mode,
                    uid=item.uid,
                    folder=target_folder,
                    message_id=item.message_id,
                    thread_id=thread_map.get(item.message_id),
                    subject=item.subject,
                    from_email=item.from_email,
                    to_emails=list(item.to_emails),
                    cc_emails=list(item.cc_emails),
                    date=item.date,
                    seen=item.seen,
                    flagged=item.flagged,
                    answered=item.answered,
                    keywords=list(item.keywords),
                    attachments=[
                        MailAttachment(
                            part_id=attachment.part_id,
                            filename=attachment.filename,
                            mime_type=attachment.mime_type,
                            size=attachment.size,
                        )
                        for attachment in item.attachments
                    ],
                )
            )
        if provider_messages:
            next_by_account[str(account.id)] = min(item.uid for item in provider_messages)

    messages.sort(key=lambda item: _date_key(item.date), reverse=True)
    return messages[:limit], next_by_account


async def read_message(
    session: AsyncSession,
    identity: RequestIdentity,
    *,
    account_id: UUID,
    folder: str,
    uid: int,
) -> MessageDetail:
    account = await get_accessible_account(account_id, identity, session)
    provider = await _build_provider(account)

    def fetch():
        provider.connect()
        try:
            folders = {item.name for item in provider.list_folders() if item.selectable}
            if folder not in folders:
                raise KeyError("folder_not_found")
            listed = provider.list_messages(folder, before_uid=uid + 1, limit=1)
            state = next((item for item in listed if item.uid == uid), None)
            if state is None:
                raise KeyError("message_not_found")
            message = provider.fetch_message(folder, uid)
            return state, message
        finally:
            provider.disconnect()

    state, message = await asyncio.to_thread(fetch)
    thread_map = await _thread_ids(session, account.id, [message.message_id])
    return MessageDetail(
        account_id=account.id,
        account_address=account.username,
        ownership_mode=account.ownership_mode,
        uid=uid,
        folder=folder,
        message_id=message.message_id,
        thread_id=thread_map.get(message.message_id),
        subject=message.subject,
        from_email=message.from_email,
        to_emails=list(message.to_emails),
        cc_emails=list(state.cc_emails),
        date=message.date,
        seen=state.seen,
        flagged=state.flagged,
        answered=state.answered,
        keywords=list(state.keywords),
        attachments=[
            MailAttachment(
                part_id=attachment.part_id,
                filename=attachment.filename,
                mime_type=attachment.mime_type,
                size=attachment.size,
            )
            for attachment in message.attachments
        ],
        body_text=message.body_text,
        safe_html=sanitize_message_html(message.body_html) if message.body_html else None,
        in_reply_to=message.in_reply_to,
        references=list(message.references),
    )


async def download_attachment(
    session: AsyncSession,
    identity: RequestIdentity,
    *,
    account_id: UUID,
    folder: str,
    uid: int,
    part_id: str,
) -> tuple[bytes, str, str]:
    account = await get_accessible_account(account_id, identity, session)
    provider = await _build_provider(account)

    def fetch():
        provider.connect()
        try:
            folders = {item.name for item in provider.list_folders() if item.selectable}
            if folder not in folders:
                raise KeyError("folder_not_found")
            message = provider.fetch_message(folder, uid)
            attachment = next(
                (item for item in message.attachments if item.part_id == part_id),
                None,
            )
            if attachment is None:
                raise KeyError("attachment_not_found")
            if attachment.size is not None and attachment.size > _MAX_ATTACHMENT_DOWNLOAD:
                raise ValueError("attachment_too_large")
            provider.set_source_folder(folder)
            payload = provider.fetch_attachment_content(uid, attachment)
            if len(payload) > _MAX_ATTACHMENT_DOWNLOAD:
                raise ValueError("attachment_too_large")
            filename = re.sub(r"[^A-Za-z0-9._ -]+", "_", attachment.filename).strip() or "attachment"
            return payload, attachment.mime_type or "application/octet-stream", filename[:180]
        finally:
            provider.disconnect()

    return await asyncio.to_thread(fetch)
