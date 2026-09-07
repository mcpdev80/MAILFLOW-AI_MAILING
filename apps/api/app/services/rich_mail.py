"""Consent-gated rich HTML rendering for mail messages."""

from __future__ import annotations

import asyncio
from email.utils import parseaddr
from urllib.parse import urlparse
from uuid import UUID

from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity
from app.mailbox_access import get_accessible_account
from app.models.processed_email import ProcessedEmail
from app.services.mail_client import _build_provider
from app.services.user_preferences import remote_content_sender_allowed

_BLOCKED_TAGS = {
    "script",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "option",
    "base",
    "meta",
}
_URL_ATTRS = {"href", "src", "background", "poster"}
_SPAM_VERDICTS = {"spam", "junk", "phishing", "malicious", "blocked"}
_PHISHING_MARKERS = {"phishing", "phish", "credential theft", "credential_theft"}


def normalize_sender_email(value: str) -> str:
    return parseaddr(value)[1].strip().lower()


def sanitize_rich_html(raw_html: str) -> str:
    """Keep newsletter layout while stripping active content and unsafe URLs.

    Remote images/styles are intentionally retained here. This function is only
    used after explicit one-time consent or a remembered sender decision. The
    frontend renders the result inside a sandboxed iframe, so scripts and forms
    cannot execute in the MailFlow origin.
    """
    soup = BeautifulSoup(raw_html or "", "html.parser")
    for tag in list(soup.find_all(True)):
        name = (tag.name or "").lower()
        if name in _BLOCKED_TAGS:
            tag.decompose()
            continue
        attrs: dict[str, object] = {}
        for key, value in dict(tag.attrs).items():
            attr = str(key).lower()
            if attr.startswith("on"):
                continue
            if attr in _URL_ATTRS:
                raw = " ".join(value) if isinstance(value, list) else str(value)
                parsed = urlparse(raw.strip())
                if parsed.scheme.lower() not in {"http", "https", "mailto", "cid", "data"}:
                    continue
                if parsed.scheme.lower() == "data" and not raw.lower().startswith("data:image/"):
                    continue
                attrs[attr] = raw
                continue
            if attr in {"style", "class", "id", "width", "height", "align", "valign", "border", "cellpadding", "cellspacing", "colspan", "rowspan", "title", "alt", "rel", "target"}:
                attrs[attr] = value
        if name == "a" and "href" in attrs:
            attrs["target"] = "_blank"
            attrs["rel"] = "noopener noreferrer"
        tag.attrs = attrs
    return str(soup)


def _looks_like_phishing(row: ProcessedEmail | None) -> bool:
    if row is None:
        return False
    if row.suspicious_content:
        return True
    values = [
        row.category,
        row.subcategory or "",
        row.classification_label or "",
        row.reason or "",
        *(row.system_tags or []),
        *(row.user_tags or []),
    ]
    normalized = " ".join(str(value).strip().lower() for value in values if value)
    return any(marker in normalized for marker in _PHISHING_MARKERS)


def _spam_blocked(row: ProcessedEmail | None) -> bool:
    if row is None:
        return False
    verdict = (row.spam_verdict or "").strip().lower()
    return verdict in _SPAM_VERDICTS


async def _processed_state(
    session: AsyncSession,
    *,
    account_id: UUID,
    message_id: str,
) -> ProcessedEmail | None:
    if not message_id:
        return None
    return (
        await session.execute(
            select(ProcessedEmail)
            .where(
                ProcessedEmail.account_id == account_id,
                ProcessedEmail.message_id == message_id,
            )
            .order_by(ProcessedEmail.processed_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def rich_message_html(
    session: AsyncSession,
    identity: RequestIdentity,
    *,
    account_id: UUID,
    folder: str,
    uid: int,
    force: bool = False,
) -> dict[str, object]:
    account = await get_accessible_account(account_id, identity, session)
    provider = await _build_provider(account)

    def fetch():
        provider.connect()
        try:
            folders = [item for item in provider.list_folders() if item.selectable]
            valid = {item.name for item in folders}
            if folder not in valid:
                raise KeyError("folder_not_found")
            folder_role = next(
                ((item.role or "").lower() for item in folders if item.name == folder),
                "",
            )
            message = provider.fetch_message(folder, uid)
            return message, folder_role
        finally:
            provider.disconnect()

    message, folder_role = await asyncio.to_thread(fetch)
    sender_email = normalize_sender_email(message.from_email)
    trusted = bool(sender_email) and await remote_content_sender_allowed(
        session, identity, sender_email
    )
    available = bool((message.body_html or "").strip())
    processed = await _processed_state(
        session,
        account_id=account_id,
        message_id=str(message.message_id or ""),
    )

    blocked_reason: str | None = None
    if folder_role == "spam" or _spam_blocked(processed):
        blocked_reason = "spam"
    elif _looks_like_phishing(processed):
        blocked_reason = "phishing"

    blocked = blocked_reason is not None
    html = (
        sanitize_rich_html(message.body_html)
        if available and not blocked and (trusted or force)
        else None
    )
    return {
        "available": available,
        "trusted": trusted,
        "blocked": blocked,
        "blocked_reason": blocked_reason,
        "sender_email": sender_email,
        "html": html,
    }
