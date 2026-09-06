"""Safety-first policy for deciding whether an email attachment belongs in the library."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import PurePath
from typing import Literal

from mailflow_core.types import AttachmentInfo

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


@dataclass(frozen=True)
class AttachmentIngestionDecision:
    status: AttachmentIngestionStatus
    reason: str
    fetch_content: bool


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


def library_mime_types() -> frozenset[str]:
    return _LIBRARY_MIME_TYPES
