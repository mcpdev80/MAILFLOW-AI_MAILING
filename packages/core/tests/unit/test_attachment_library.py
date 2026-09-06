from mailflow_core.attachment_library import (
    decide_attachment_ingestion,
    derive_document_metadata,
)
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


def test_invoice_filename_derives_source_neutral_finance_metadata() -> None:
    metadata = derive_document_metadata(
        attachment("Rechnung-2026-09.pdf", "application/pdf")
    )
    assert metadata.document_type == "invoice"
    assert metadata.category == "finance"
    assert metadata.subcategory is None
    assert metadata.confidence == 0.92
    assert metadata.tags == ("invoice",)


def test_document_text_hint_can_identify_contract_without_mail_context() -> None:
    metadata = derive_document_metadata(
        attachment("document.pdf", "application/pdf"),
        extracted_text="Vertrag zwischen Beispiel GmbH und dem Auftragnehmer",
    )
    assert metadata.document_type == "contract"
    assert metadata.category == "other"
    assert metadata.confidence == 0.92


def test_calendar_mime_derives_appointments_category() -> None:
    metadata = derive_document_metadata(
        attachment("invite.ics", "text/calendar")
    )
    assert metadata.document_type == "calendar"
    assert metadata.category == "appointments"
    assert metadata.confidence == 0.88


def test_unknown_pdf_falls_back_to_low_confidence_generic_type() -> None:
    metadata = derive_document_metadata(
        attachment("scan.pdf", "application/pdf")
    )
    assert metadata.document_type == "pdf_document"
    assert metadata.category == "other"
    assert metadata.confidence == 0.40
