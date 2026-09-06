from mailflow_core.attachment_library import decide_attachment_ingestion
from mailflow_core.types import AttachmentInfo


def attachment(
    filename: str,
    mime_type: str,
    *,
    size: int = 100_000,
    disposition: str | None = "attachment",
) -> AttachmentInfo:
    return AttachmentInfo(
        part_id="2",
        filename=filename,
        mime_type=mime_type,
        size=size,
        disposition=disposition,
    )


def test_safe_pdf_is_stored() -> None:
    decision = decide_attachment_ingestion(
        attachment("invoice.pdf", "application/pdf")
    )
    assert decision.status == "store"
    assert decision.fetch_content is True


def test_suspicious_mail_blocks_without_fetching_binary() -> None:
    decision = decide_attachment_ingestion(
        attachment("invoice.pdf", "application/pdf"), message_suspicious=True
    )
    assert decision.status == "block"
    assert decision.fetch_content is False


def test_spam_mail_blocks_without_fetching_binary() -> None:
    decision = decide_attachment_ingestion(
        attachment("invoice.pdf", "application/pdf"), spam_verdict="spam"
    )
    assert decision.status == "block"
    assert decision.fetch_content is False


def test_inline_logo_is_ignored() -> None:
    decision = decide_attachment_ingestion(
        attachment("company-logo.png", "image/png", disposition="inline")
    )
    assert decision.status == "ignore"
    assert decision.fetch_content is False


def test_tiny_signature_image_is_ignored() -> None:
    decision = decide_attachment_ingestion(
        attachment("signature.png", "image/png", size=8_000)
    )
    assert decision.status == "ignore"


def test_normal_photo_attachment_is_kept() -> None:
    decision = decide_attachment_ingestion(
        attachment("scan-2026.jpg", "image/jpeg", size=2_000_000)
    )
    assert decision.status == "store"


def test_dangerous_executable_is_blocked() -> None:
    decision = decide_attachment_ingestion(
        attachment("payment.exe", "application/octet-stream")
    )
    assert decision.status == "block"
    assert decision.fetch_content is False


def test_unsupported_type_does_not_fetch() -> None:
    decision = decide_attachment_ingestion(
        attachment("archive.7z", "application/x-7z-compressed")
    )
    assert decision.status == "unsupported"
    assert decision.fetch_content is False
