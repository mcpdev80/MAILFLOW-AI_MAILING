"""Bounded, non-executing attachment extraction for classification context."""

from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass
from pathlib import PurePath
from xml.etree import ElementTree

from mailflow_core.content_security import sanitize_text

AttachmentStatus = str

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
class AttachmentMetadata:
    """Lightweight provider metadata that never requires loading attachment bytes."""

    part_id: str
    filename: str
    mime_type: str
    size: int | None = None
    disposition: str | None = None

    @property
    def extension(self) -> str:
        return PurePath(self.filename).suffix.lower()

    @property
    def supported(self) -> bool:
        return self.mime_type.lower() in _SUPPORTED_MIME_TYPES

    @property
    def high_signal(self) -> bool:
        mime = self.mime_type.lower()
        name = self.filename.lower()
        return mime in _HIGH_SIGNAL_TYPES or name.endswith((".ics", ".pdf"))


@dataclass(frozen=True)
class AttachmentExtractionConfig:
    max_attachment_bytes: int = 5 * 1024 * 1024
    max_extracted_chars: int = 8_000
    max_attachments: int = 2
    allowed_mime_types: frozenset[str] = _SUPPORTED_MIME_TYPES

    def __post_init__(self) -> None:
        if self.max_attachment_bytes <= 0:
            raise ValueError("max_attachment_bytes must be positive")
        if self.max_extracted_chars <= 0:
            raise ValueError("max_extracted_chars must be positive")
        if self.max_attachments <= 0:
            raise ValueError("max_attachments must be positive")


@dataclass(frozen=True)
class ExtractedAttachment:
    metadata: AttachmentMetadata
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


def should_inspect_attachments(
    *,
    confidence: float,
    confidence_threshold: float,
    needs_more_context: bool,
    body_text: str,
    attachments: tuple[AttachmentMetadata, ...],
    force: bool = False,
) -> bool:
    """Return whether attachment content is worth an extra classification step."""
    if not attachments:
        return False
    if force or needs_more_context or confidence < confidence_threshold or not body_text.strip():
        return True
    return any(item.high_signal for item in attachments)


def eligible_attachments(
    attachments: tuple[AttachmentMetadata, ...],
    config: AttachmentExtractionConfig,
) -> tuple[AttachmentMetadata, ...]:
    """Select supported, bounded attachments without touching attachment bytes."""
    selected: list[AttachmentMetadata] = []
    for item in attachments:
        if len(selected) >= config.max_attachments:
            break
        if item.mime_type.lower() not in config.allowed_mime_types:
            continue
        if item.size is not None and item.size > config.max_attachment_bytes:
            continue
        selected.append(item)
    return tuple(selected)


def extract_attachment(
    metadata: AttachmentMetadata,
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
            text = _extract_calendar(payload)
        elif mime == "application/pdf":
            text = _extract_pdf(payload)
        elif mime.endswith("wordprocessingml.document"):
            text = _extract_openxml(payload, ("word/document.xml",))
        elif mime.endswith("spreadsheetml.sheet"):
            text = _extract_openxml(payload, ("xl/sharedStrings.xml", "xl/worksheets/"))
        elif mime.endswith("presentationml.presentation"):
            text = _extract_openxml(payload, ("ppt/slides/",))
        else:
            return ExtractedAttachment(metadata=metadata, status="skipped", error="unsupported_type")
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


def _extract_pdf(payload: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(payload), strict=False)
    parts: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        if text:
            parts.append(text)
    return "\n".join(parts)


def _extract_calendar(payload: bytes) -> str:
    raw = payload.decode("utf-8", errors="replace").replace("\r\n", "\n")
    raw = re.sub(r"\n[ \t]", "", raw)
    fields = ("SUMMARY", "DTSTART", "DTEND", "ORGANIZER", "LOCATION")
    found: list[str] = []
    for line in raw.splitlines():
        key = line.split(":", 1)[0].split(";", 1)[0].upper()
        if key in fields and ":" in line:
            found.append(f"{key}: {line.split(':', 1)[1].strip()}")
    return "\n".join(found)


def _extract_openxml(payload: bytes, prefixes: tuple[str, ...]) -> str:
    parts: list[str] = []
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        names = sorted(
            name
            for name in archive.namelist()
            if name.endswith(".xml") and any(name == prefix or name.startswith(prefix) for prefix in prefixes)
        )
        for name in names:
            root = ElementTree.fromstring(archive.read(name))
            for element in root.iter():
                if element.text and element.tag.rsplit("}", 1)[-1] in {"t", "v"}:
                    value = element.text.strip()
                    if value:
                        parts.append(value)
    return "\n".join(parts)
