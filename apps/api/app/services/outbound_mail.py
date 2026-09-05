"""Outbound mail construction and SMTP delivery.

The service deliberately separates user-controlled draft persistence from the
transport mutation. No generated content is ever sent from here without an
explicit API send request.
"""

from __future__ import annotations

import asyncio
import base64
import re
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import make_msgid, parseaddr

from app import oauth
from app.crypto import decrypt_secret
from app.models.email_account import EmailAccount
from app.models.outbound_draft import OutboundDraft

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024

_ATTACHMENT_MENTION_RE = re.compile(
    r"\b(attach(?:ed|ment)?|enclosed|anlage|anhang|angeh[aä]ngt|adjunto|archivo adjunto)\b",
    re.IGNORECASE,
)


class OutboundMailError(RuntimeError):
    """Safe transport/domain error suitable for mapping to an API error code."""


@dataclass(frozen=True)
class SMTPConfig:
    host: str
    port: int
    security: str
    username: str
    password: str | None = None
    oauth_access_token: str | None = None


def normalized_address(value: str) -> str:
    """Return a minimally validated mailbox address without header injection."""
    if "\r" in value or "\n" in value:
        raise OutboundMailError("invalid_recipient")
    _display, address = parseaddr(value)
    if (
        not address
        or "@" not in address
        or address.startswith("@")
        or address.endswith("@")
    ):
        raise OutboundMailError("invalid_recipient")
    return value.strip()


def pre_send_warnings(draft: OutboundDraft) -> list[str]:
    warnings: list[str] = []
    if not (draft.to_recipients or draft.cc_recipients or draft.bcc_recipients):
        warnings.append("missing_recipient")
    if _ATTACHMENT_MENTION_RE.search(draft.body_text or "") and not draft.attachments:
        warnings.append("attachment_mentioned_but_missing")
    return warnings


def validate_sendable(draft: OutboundDraft) -> None:
    if draft.status == "discarded":
        raise OutboundMailError("draft_discarded")
    if draft.status == "sent":
        return
    if not (draft.to_recipients or draft.cc_recipients or draft.bcc_recipients):
        raise OutboundMailError("missing_recipient")
    for value in (
        *draft.to_recipients,
        *draft.cc_recipients,
        *draft.bcc_recipients,
    ):
        normalized_address(value)


def build_message(account: EmailAccount, draft: OutboundDraft) -> EmailMessage:
    """Build one standards-compatible MIME message from persisted draft state."""
    validate_sendable(draft)
    message = EmailMessage()
    message["From"] = normalized_address(account.username)
    if draft.to_recipients:
        message["To"] = ", ".join(draft.to_recipients)
    if draft.cc_recipients:
        message["Cc"] = ", ".join(draft.cc_recipients)
    message["Subject"] = draft.subject
    message_id = draft.sent_message_id or make_msgid()
    message["Message-ID"] = message_id
    if draft.in_reply_to:
        message["In-Reply-To"] = draft.in_reply_to
    if draft.references:
        message["References"] = " ".join(draft.references)

    message.set_content(draft.body_text or "")
    if draft.body_html:
        message.add_alternative(draft.body_html, subtype="html")

    total = 0
    for attachment in draft.attachments:
        total += attachment.size_bytes
        if (
            attachment.size_bytes > MAX_ATTACHMENT_BYTES
            or total > MAX_TOTAL_ATTACHMENT_BYTES
        ):
            raise OutboundMailError("attachment_size_limit")
        maintype, _, subtype = (
            attachment.content_type or "application/octet-stream"
        ).partition("/")
        if not subtype:
            maintype, subtype = "application", "octet-stream"
        message.add_attachment(
            attachment.content,
            maintype=maintype,
            subtype=subtype,
            filename=attachment.filename,
        )
    return message


def _provider_default(account: EmailAccount) -> tuple[str, int, str] | None:
    if account.provider_type == "gmail":
        return "smtp.gmail.com", 587, "starttls"
    if account.provider_type == "microsoft":
        return "smtp.office365.com", 587, "starttls"
    return None


def smtp_config_for_account(account: EmailAccount) -> SMTPConfig:
    default = _provider_default(account)
    host = account.smtp_host or (default[0] if default else None)
    port = account.smtp_port or (default[1] if default else None)
    security = account.smtp_security or (default[2] if default else "starttls")
    username = account.smtp_username or account.username
    if not host or not port:
        raise OutboundMailError("smtp_not_configured")

    if account.provider_type in {"gmail", "microsoft"} and account.encrypted_oauth:
        oauth_data = decrypt_secret(account.encrypted_oauth)
        refresh_token = oauth_data.get("refresh_token")
        if not refresh_token:
            raise OutboundMailError("oauth_refresh_token_missing")
        access_token = oauth.access_token_from_refresh(
            account.provider_type,
            refresh_token,
        )
        return SMTPConfig(
            host=host,
            port=port,
            security=security,
            username=username,
            oauth_access_token=access_token,
        )

    if not account.encrypted_credentials:
        raise OutboundMailError("smtp_credentials_missing")
    secret = decrypt_secret(account.encrypted_credentials)
    password = secret.get("password")
    if not isinstance(password, str) or not password:
        raise OutboundMailError("smtp_credentials_missing")
    return SMTPConfig(
        host=host,
        port=port,
        security=security,
        username=username,
        password=password,
    )


def _xoauth2(username: str, access_token: str) -> str:
    raw = f"user={username}\x01auth=Bearer {access_token}\x01\x01".encode()
    return base64.b64encode(raw).decode()


def _authenticate(client: smtplib.SMTP, config: SMTPConfig) -> None:
    if config.oauth_access_token:
        code, _response = client.docmd(
            "AUTH",
            "XOAUTH2 " + _xoauth2(config.username, config.oauth_access_token),
        )
        if code not in {235, 503}:
            raise OutboundMailError(f"smtp_auth_failed:{code}")
    elif config.password:
        client.login(config.username, config.password)


def _send_sync(
    config: SMTPConfig,
    message: EmailMessage,
    recipients: list[str],
) -> None:
    context = ssl.create_default_context()
    if config.security == "ssl":
        with smtplib.SMTP_SSL(
            config.host,
            config.port,
            timeout=30,
            context=context,
        ) as client:
            client.ehlo()
            _authenticate(client, config)
            client.send_message(
                message,
                from_addr=config.username,
                to_addrs=recipients,
            )
        return

    with smtplib.SMTP(config.host, config.port, timeout=30) as client:
        client.ehlo()
        if config.security == "starttls":
            client.starttls(context=context)
            client.ehlo()
        _authenticate(client, config)
        client.send_message(
            message,
            from_addr=config.username,
            to_addrs=recipients,
        )


async def send_draft(account: EmailAccount, draft: OutboundDraft) -> str:
    """Send a persisted draft after the caller has persisted the send fence.

    We intentionally do not auto-retry SMTP delivery because an ambiguous
    connection loss after DATA could otherwise duplicate delivery.
    """
    message = build_message(account, draft)
    recipients = [
        normalized_address(value)
        for value in (
            *draft.to_recipients,
            *draft.cc_recipients,
            *draft.bcc_recipients,
        )
    ]
    config = await asyncio.to_thread(smtp_config_for_account, account)
    await asyncio.to_thread(_send_sync, config, message, recipients)
    return str(message["Message-ID"])
