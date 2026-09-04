"""Bounded, non-executing attachment extraction for classification context."""

from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass
from typing import Literal
from xml.etree import ElementTree

from pypdf import PdfReader

from mailflow_core.content_security import sanitize_text
from mailflow_core.types import AttachmentInfo

AttachmentStatus = Literal["not_needed", "used", "skipped", "failed"]

_SUPPORTED_MIME_TYPES = frozenset(
    {
        "text/plain",
        "text/csv",
        "text/calendar",
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }
)
_HIGH_SIGNAL_TYPES = frozenset({"application/pdf", "text/calendar"})


@dataclass(frozen=True)
class AttachmentExtractionConfig:
    max_attachment_bytes: int = 5 * 1024 * 1024
    max_extracted_chars: int = 8_000
    max_attachments: int = 2
    max_pdf_pages: int = 50
    max_archive_entries: int = 64
    max_archive_uncompressed_bytes: int = 2 * 1024 * 1024
    allowed_mime_types: frozenset[str] = _SUPPORTED_MIME_TYPES

    def __post_init__(self) -> None:
        if self.max_attachment_bytes <= 0:
            raise ValueError("max_attachment_bytes must be positive")
        if self.max_extracted_chars <= 0:
            raise ValueError("max_extracted_chars must be positive")
        if self.max_attachments <= 0:
            raise ValueError("max_attachments must be positive")
        if self.max_pdf_pages <= 0:
            raise ValueError("max_pdf_pages must be positive")
        if self.max_archive_entries <= 0:
            raise ValueError("max_archive_entries must be positive")
        if self.max_archive_uncompressed_bytes <= 0:
            raise ValueError("max_archive_uncompressed_bytes must be positive")


@dataclass(frozen=True)
class ExtractedAttachment:
    metadata: AttachmentInfo
    status: AttachmentStatus
    text: str = ""
    error: str | None = None

    def prompt_block(self) -> str:
        header = (
            f"filename={self.metadata.filename}; mime={self.metadata.mime_type}; "
            f"size={self.metadata.size if self.metadata.size is not None else 'unknown'}"
        )
        if not self.text:
            return header
        return f"{header}\n{self.text}"


def is_supported_attachment(item: AttachmentInfo, config: AttachmentExtractionConfig) -> bool:
    return item.mime_type.lower() in config.allowed_mime_types


def is_high_signal_attachment(item: AttachmentInfo) -> bool:
    mime = item.mime_type.lower()
    name = item.filename.lower()
    return mime in _HIGH_SIGNAL_TYPES or name.endswith((".ics", ".pdf"))


def should_inspect_attachments(
    *,
    confidence: float,
    confidence_threshold: float,
    needs_more_context: bool,
    body_text: str,
    attachments: tuple[AttachmentInfo, ...],
    force: bool = False,
) -> bool:
    """Return whether attachment content is worth an extra classification step."""
    if not attachments:
        return False
    if force or needs_more_context or confidence < confidence_threshold or not body_text.strip():
        return True
    return any(is_high_signal_attachment(item) for item in attachments)


def eligible_attachments(
    attachments: tuple[AttachmentInfo, ...],
    config: AttachmentExtractionConfig,
) -> tuple[AttachmentInfo, ...]:
    """Select supported, bounded attachments without touching attachment bytes."""
    selected: list[AttachmentInfo] = []
    for item in attachments:
        if len(selected) >= config.max_attachments:
            break
        if not is_supported_attachment(item, config):
            continue
        if item.size is not None and item.size > config.max_attachment_bytes:
            continue
        selected.append(item)
    return tuple(selected)


def extract_attachment(
    metadata: AttachmentInfo,
    payload: bytes,
    *,
    config: AttachmentExtractionConfig,
) -> ExtractedAttachment:
    """Extract inert text from one allowed attachment with strict size/output limits."""
    mime = metadata.mime_type.lower()
    if mime not in config.allowed_mime_types:
        return ExtractedAttachment(metadata=metadata, status="skipped", error="unsupported_type")
    if metadata.size is not None and metadata.size > config.max_attachment_bytes:
        return ExtractedAttachment(metadata=metadata, status="skipped", error="oversized")
    if len(payload) > config.max_attachment_bytes:
        return ExtractedAttachment(metadata=metadata, status="skipped", error="oversized")

    try:
        if mime in {"text/plain", "text/csv"}:
            text = payload.decode("utf-8", errors="replace")
        elif mime == "text/calendar":
            text = _extract_calendar(payload, config.max_extracted_chars)
        elif mime == "application/pdf":
            text = _extract_pdf(
                payload,
                max_chars=config.max_extracted_chars,
                max_pages=config.max_pdf_pages,
            )
        elif mime.endswith("wordprocessingml.document"):
            text = _extract_openxml(payload, ("word/document.xml",), config=config)
        elif mime.endswith("spreadsheetml.sheet"):
            text = _extract_openxml(
                payload,
                ("xl/sharedStrings.xml", "xl/worksheets/"),
                config=config,
            )
        elif mime.endswith("presentationml.presentation"):
            text = _extract_openxml(payload, ("ppt/slides/",), config=config)
        else:
            return ExtractedAttachment(
                metadata=metadata,
                status="skipped",
                error="unsupported_type",
            )
    except Exception as exc:
        return ExtractedAttachment(
            metadata=metadata,
            status="failed",
            error=f"{type(exc).__name__}: {str(exc)[:160]}",
        )

    text = sanitize_text(text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text[: config.max_extracted_chars]
    if not text:
        return ExtractedAttachment(metadata=metadata, status="skipped", error="no_extractable_text")
    return ExtractedAttachment(metadata=metadata, status="used", text=text)


def _extract_pdf(payload: bytes, *, max_chars: int, max_pages: int) -> str:
    reader = PdfReader(io.BytesIO(payload), strict=False)
    parts: list[str] = []
    chars = 0
    for page in reader.pages[:max_pages]:
        text = page.extract_text() or ""
        if not text:
            continue
        remaining = max_chars - chars
        if remaining <= 0:
            break
        piece = text[:remaining]
        parts.append(piece)
        chars += len(piece)
        if chars >= max_chars:
            break
    return "\n".join(parts)


def _extract_calendar(payload: bytes, max_chars: int) -> str:
    raw = payload.decode("utf-8", errors="replace").replace("\r\n", "\n")
    raw = re.sub(r"\n[ \t]", "", raw)
    fields = ("SUMMARY", "DTSTART", "DTEND", "ORGANIZER", "LOCATION")
    found: list[str] = []
    chars = 0
    for line in raw.splitlines():
        key = line.split(":", 1)[0].split(";", 1)[0].upper()
        if key not in fields or ":" not in line:
            continue
        value = f"{key}: {line.split(':', 1)[1].strip()}"
        remaining = max_chars - chars
        if remaining <= 0:
            break
        found.append(value[:remaining])
        chars += min(len(value), remaining)
        if chars >= max_chars:
            break
    return "\n".join(found)


def _extract_openxml(
    payload: bytes,
    prefixes: tuple[str, ...],
    *,
    config: AttachmentExtractionConfig,
) -> str:
    parts: list[str] = []
    chars = 0
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        selected = [
            info
            for info in archive.infolist()
            if info.filename.endswith(".xml")
            and any(
                info.filename == prefix or info.filename.startswith(prefix) for prefix in prefixes
            )
        ]
        selected.sort(key=lambda item: item.filename)
        if len(selected) > config.max_archive_entries:
            raise ValueError("archive_entry_limit_exceeded")
        total_uncompressed = sum(info.file_size for info in selected)
        if total_uncompressed > config.max_archive_uncompressed_bytes:
            raise ValueError("archive_uncompressed_limit_exceeded")

        for info in selected:
            root = ElementTree.fromstring(archive.read(info))
            for element in root.iter():
                if not element.text or element.tag.rsplit("}", 1)[-1] not in {"t", "v"}:
                    continue
                value = element.text.strip()
                if not value:
                    continue
                remaining = config.max_extracted_chars - chars
                if remaining <= 0:
                    return "\n".join(parts)
                piece = value[:remaining]
                parts.append(piece)
                chars += len(piece)
                if chars >= config.max_extracted_chars:
                    return "\n".join(parts)
    return "\n".join(parts)
