"""Safety-first attachment-library policy and lightweight document metadata derivation."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import PurePath
from typing import Literal

from mailflow_core.types import AttachmentInfo, ClassificationResult

AttachmentIngestionStatus = Literal["store", "ignore", "block", "unsupported"]

# Types that are useful as documents without executing content.
_LIBRARY_MIME_TYPES = frozenset(
    {
        "application/pdf",
        "application/rtf",
        "application/vnd.ms-excel",
        "application/vnd.ms-powerpoint",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
        "text/csv",
        "text/calendar",
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
    }
)

_DANGEROUS_EXTENSIONS = frozenset(
    {
        ".app",
        ".bat",
        ".cmd",
        ".com",
        ".cpl",
        ".dll",
        ".exe",
        ".hta",
        ".jar",
        ".js",
        ".jse",
        ".lnk",
        ".msi",
        ".msp",
        ".ps1",
        ".reg",
        ".scr",
        ".vbe",
        ".vbs",
        ".wsf",
    }
)

_NOISE_NAME = re.compile(
    r"(?:^|[._\- ])(?:logo|signature|sig|spacer|tracking|pixel|facebook|instagram|linkedin|twitter|x-icon|youtube|whatsapp|icon)(?:$|[._\- ])",
    re.IGNORECASE,
)

_DOCUMENT_HINTS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "invoice",
        re.compile(
            r"\b(invoice|rechnung|factura|invoice[-_ ]?no|rechnungs?[-_ ]?nr)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "receipt",
        re.compile(r"\b(receipt|beleg|quittung|kassenbon|recibo)\b", re.IGNORECASE),
    ),
    (
        "contract",
        re.compile(r"\b(contract|vertrag|agreement|vereinbarung|contrato)\b", re.IGNORECASE),
    ),
    (
        "ticket",
        re.compile(r"\b(ticket|boarding pass|bordkarte|fahrkarte|entrada)\b", re.IGNORECASE),
    ),
    (
        "statement",
        re.compile(r"\b(statement|kontoauszug|abrechnung|extracto)\b", re.IGNORECASE),
    ),
    (
        "certificate",
        re.compile(r"\b(certificate|zertifikat|bescheinigung|certificado)\b", re.IGNORECASE),
    ),
)


@dataclass(frozen=True)
class AttachmentIngestionDecision:
    status: AttachmentIngestionStatus
    reason: str
    fetch_content: bool


@dataclass(frozen=True)
class AttachmentDocumentMetadata:
    """Conservative initial metadata derived without an additional model request.

    The parent email classification is already AI/rule-derived and is therefore a
    useful organizational signal. Document type is inferred only from explicit
    filename/text hints or MIME family. A later dedicated document-model pass can
    replace these values without changing the storage or permission model.
    """

    document_type: str
    category: str
    subcategory: str | None
    confidence: float
    tags: tuple[str, ...]


def decide_attachment_ingestion(
    attachment: AttachmentInfo,
    *,
    message_suspicious: bool = False,
    spam_verdict: str = "unknown",
    max_bytes: int = 25 * 1024 * 1024,
) -> AttachmentIngestionDecision:
    """Return a conservative ingestion decision before fetching attachment bytes.

    Spam/phishing/suspicious message context is a hard gate: binary content is not
    fetched into the library. Inline/decorative assets are silently ignored.
    """
    filename = (attachment.filename or "").strip()
    mime = (attachment.mime_type or "application/octet-stream").lower().strip()
    disposition = (attachment.disposition or "").lower().strip()
    size = attachment.size
    suffix = PurePath(filename.lower()).suffix

    if message_suspicious or spam_verdict.lower() in {"spam", "suspicious", "phishing"}:
        return AttachmentIngestionDecision("block", "unsafe_message_context", False)

    if suffix in _DANGEROUS_EXTENSIONS:
        return AttachmentIngestionDecision("block", "dangerous_file_type", False)

    if size is not None and size > max_bytes:
        return AttachmentIngestionDecision("unsupported", "file_too_large", False)

    if not filename:
        return AttachmentIngestionDecision("ignore", "missing_filename", False)

    if mime.startswith("image/"):
        # Inline images in HTML mail are overwhelmingly decoration/signatures.
        if disposition == "inline":
            return AttachmentIngestionDecision("ignore", "inline_image", False)
        if _NOISE_NAME.search(filename):
            return AttachmentIngestionDecision("ignore", "decorative_image", False)
        # Tiny image attachments are commonly icons/signature assets. Keep this
        # deliberately conservative: normal photos/scans are much larger.
        if size is not None and size <= 16 * 1024:
            return AttachmentIngestionDecision("ignore", "tiny_image_asset", False)

    if _NOISE_NAME.search(filename) and size is not None and size <= 256 * 1024:
        return AttachmentIngestionDecision("ignore", "decorative_asset", False)

    if mime not in _LIBRARY_MIME_TYPES:
        return AttachmentIngestionDecision("unsupported", "unsupported_type", False)

    return AttachmentIngestionDecision("store", "relevant_safe_attachment", True)


def derive_document_metadata(
    attachment: AttachmentInfo,
    *,
    classification: ClassificationResult,
    extracted_text: str | None = None,
) -> AttachmentDocumentMetadata:
    """Seed document metadata from explicit content hints plus the email classification."""
    filename = (attachment.filename or "").strip()
    mime = (attachment.mime_type or "application/octet-stream").lower().strip()
    haystack = f"{filename}\n{(extracted_text or '')[:4000]}"

    document_type: str | None = None
    for candidate, pattern in _DOCUMENT_HINTS:
        if pattern.search(haystack):
            document_type = candidate
            break

    if document_type is None:
        if mime == "text/calendar":
            document_type = "calendar"
        elif mime.startswith("image/"):
            document_type = "image"
        elif "spreadsheet" in mime or mime in {"text/csv", "application/vnd.ms-excel"}:
            document_type = "spreadsheet"
        elif "presentation" in mime or mime == "application/vnd.ms-powerpoint":
            document_type = "presentation"
        elif mime == "application/pdf":
            document_type = "pdf_document"
        else:
            document_type = "document"

    category = classification.category
    subcategory = classification.subcategory
    confidence = max(0.0, min(1.0, classification.confidence * 0.95))
    tags = tuple(
        dict.fromkeys(
            [
                document_type,
                *classification.system_tags,
                *classification.user_tags,
            ]
        )
    )
    return AttachmentDocumentMetadata(
        document_type=document_type,
        category=category,
        subcategory=subcategory,
        confidence=confidence,
        tags=tags,
    )


def library_mime_types() -> frozenset[str]:
    return _LIBRARY_MIME_TYPES
