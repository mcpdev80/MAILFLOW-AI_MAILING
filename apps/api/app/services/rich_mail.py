"""Consent-gated rich HTML rendering for mail messages."""

from __future__ import annotations

import asyncio
from email.utils import parseaddr
from urllib.parse import urlparse
from uuid import UUID

from bs4 import BeautifulSoup
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity
from app.mailbox_access import get_accessible_account
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
            valid = {item.name for item in provider.list_folders() if item.selectable}
            if folder not in valid:
                raise KeyError("folder_not_found")
            message = provider.fetch_message(folder, uid)
            return message
        finally:
            provider.disconnect()

    message = await asyncio.to_thread(fetch)
    sender_email = normalize_sender_email(message.from_email)
    trusted = bool(sender_email) and await remote_content_sender_allowed(
        session, identity, sender_email
    )
    available = bool((message.body_html or "").strip())
    html = sanitize_rich_html(message.body_html) if available and (trusted or force) else None
    return {
        "available": available,
        "trusted": trusted,
        "sender_email": sender_email,
        "html": html,
    }
