from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.outbound_mail import (
    OutboundMailError,
    build_message,
    normalized_address,
    pre_send_warnings,
)


def _account(**overrides):
    values = {
        "username": "sender@example.com",
        "provider_type": "imap",
        "smtp_host": "smtp.example.com",
        "smtp_port": 587,
        "smtp_security": "starttls",
        "smtp_username": None,
        "encrypted_credentials": None,
        "encrypted_oauth": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _draft(**overrides):
    values = {
        "status": "draft",
        "to_recipients": ["Alice <alice@example.com>"],
        "cc_recipients": [],
        "bcc_recipients": [],
        "subject": "Project update",
        "body_text": "Hello Alice",
        "body_html": "<p>Hello Alice</p>",
        "sent_message_id": "<stable@example.com>",
        "in_reply_to": None,
        "references": [],
        "attachments": [],
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_normalized_address_rejects_header_injection() -> None:
    with pytest.raises(OutboundMailError, match="invalid_recipient"):
        normalized_address("victim@example.com\nBcc: attacker@example.com")


def test_normalized_address_rejects_non_address() -> None:
    with pytest.raises(OutboundMailError, match="invalid_recipient"):
        normalized_address("not-an-address")


def test_build_message_keeps_bcc_out_of_headers_and_thread_metadata() -> None:
    draft = _draft(
        cc_recipients=["cc@example.com"],
        bcc_recipients=["hidden@example.com"],
        in_reply_to="<parent@example.com>",
        references=["<root@example.com>", "<parent@example.com>"],
    )

    message = build_message(_account(), draft)

    assert message["From"] == "sender@example.com"
    assert "alice@example.com" in str(message["To"])
    assert message["Cc"] == "cc@example.com"
    assert message["Bcc"] is None
    assert message["Message-ID"] == "<stable@example.com>"
    assert message["In-Reply-To"] == "<parent@example.com>"
    assert message["References"] == "<root@example.com> <parent@example.com>"
    assert message.is_multipart()


def test_build_message_adds_attachment() -> None:
    attachment = SimpleNamespace(
        filename="invoice.pdf",
        content_type="application/pdf",
        size_bytes=4,
        content=b"%PDF",
    )
    message = build_message(_account(), _draft(attachments=[attachment]))

    attachments = list(message.iter_attachments())
    assert len(attachments) == 1
    assert attachments[0].get_filename() == "invoice.pdf"
    assert attachments[0].get_content_type() == "application/pdf"


@pytest.mark.parametrize(
    "text",
    [
        "Please see the attachment.",
        "Die Rechnung findest du im Anhang.",
        "He adjuntado el documento como archivo adjunto.",
    ],
)
def test_pre_send_warns_when_attachment_is_mentioned_but_missing(text: str) -> None:
    warnings = pre_send_warnings(_draft(body_text=text))
    assert "attachment_mentioned_but_missing" in warnings


def test_pre_send_does_not_warn_when_attachment_exists() -> None:
    attachment = SimpleNamespace(size_bytes=1)
    warnings = pre_send_warnings(
        _draft(body_text="Siehe Anhang.", attachments=[attachment])
    )
    assert "attachment_mentioned_but_missing" not in warnings


def test_pre_send_marks_missing_recipient() -> None:
    warnings = pre_send_warnings(
        _draft(to_recipients=[], cc_recipients=[], bcc_recipients=[])
    )
    assert "missing_recipient" in warnings
