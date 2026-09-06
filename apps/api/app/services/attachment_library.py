"""Attachment-library ingestion integrated with normal mailbox processing."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from uuid import UUID

from mailflow_core.attachment_library import decide_attachment_ingestion
from mailflow_core.attachments import AttachmentExtractionConfig, extract_attachment
from mailflow_core.providers.base import EmailData, EmailProvider
from mailflow_core.types import ClassificationResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.attachment_library_config import attachment_library_settings
from app.attachment_storage import AttachmentStorage, attachment_storage
from app.models.email_account import EmailAccount
from app.repositories.attachment_library import AttachmentLibraryRepository
from app.secrets import redact_text

log = logging.getLogger("mailflow.attachments")


def _received_at(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed
    except (TypeError, ValueError, OverflowError):
        return None


def _extracted_text(attachment, payload: bytes) -> str | None:
    try:
        result = extract_attachment(
            attachment,
            payload,
            config=AttachmentExtractionConfig(
                max_attachment_bytes=attachment_library_settings.ATTACHMENT_LIBRARY_MAX_BYTES,
                max_extracted_chars=attachment_library_settings.ATTACHMENT_LIBRARY_MAX_EXTRACTED_CHARS,
                max_attachments=1,
            ),
        )
        return result.text or None
    except Exception as exc:  # extraction must never break mail processing
        log.info("Attachment text extraction skipped: %s", redact_text(str(exc)))
        return None


async def ingest_message_attachments(
    session: AsyncSession,
    *,
    account: EmailAccount,
    email_data: EmailData,
    thread_id: str | None,
    classification: ClassificationResult,
    provider: EmailProvider,
    source_folder: str,
    storage: AttachmentStorage = attachment_storage,
) -> None:
    """Persist attachment observations and safe unique binaries.

    Blocked/ignored/unsupported items are metadata-only observations. Their bytes
    are intentionally never fetched into the global library.
    """
    if not attachment_library_settings.ATTACHMENT_LIBRARY_ENABLED:
        return
    if not email_data.attachments:
        return

    repo = AttachmentLibraryRepository(session)
    spam_verdict = email_data.auth_signals.spam_verdict
    received_at = _received_at(email_data.date)

    for attachment in email_data.attachments:
        if await repo.find_source(account.id, source_folder, email_data.uid, attachment.part_id):
            continue

        decision = decide_attachment_ingestion(
            attachment,
            message_suspicious=classification.suspicious_content,
            spam_verdict=spam_verdict,
            max_bytes=attachment_library_settings.ATTACHMENT_LIBRARY_MAX_BYTES,
        )
        source_status = {
            "store": "stored",
            "ignore": "ignored",
            "block": "blocked",
            "unsupported": "unsupported",
        }[decision.status]

        if not decision.fetch_content:
            await repo.add_source_if_missing(
                document_id=None,
                account_id=account.id,
                uid=email_data.uid,
                folder=source_folder,
                part_id=attachment.part_id,
                message_id=email_data.message_id,
                thread_id=thread_id,
                from_email=email_data.from_email,
                subject=email_data.subject,
                received_at=received_at,
                source_filename=attachment.filename,
                mime_type=attachment.mime_type,
                size_bytes=attachment.size,
                disposition=attachment.disposition,
                ingestion_status=source_status,
                safety_reason=decision.reason,
            )
            continue

        try:
            payload = provider.fetch_attachment_content(email_data.uid, attachment)
            stored = storage.put(account.org_id, payload)
            document = await repo.get_or_create_document(
                org_id=account.org_id,
                content_sha256=stored.content_sha256,
                storage_key=stored.storage_key,
                canonical_filename=attachment.filename,
                mime_type=attachment.mime_type,
                size_bytes=stored.size_bytes,
                extracted_text=_extracted_text(attachment, payload),
            )
            await repo.add_source_if_missing(
                document_id=document.id,
                account_id=account.id,
                uid=email_data.uid,
                folder=source_folder,
                part_id=attachment.part_id,
                message_id=email_data.message_id,
                thread_id=thread_id,
                from_email=email_data.from_email,
                subject=email_data.subject,
                received_at=received_at,
                source_filename=attachment.filename,
                mime_type=attachment.mime_type,
                size_bytes=stored.size_bytes,
                disposition=attachment.disposition,
                ingestion_status="stored",
                safety_reason=None,
            )
        except Exception as exc:  # attachment failure must not fail the mail cycle
            log.warning(
                "Attachment ingestion failed for account=%s uid=%s part=%s: %s",
                account.id,
                email_data.uid,
                attachment.part_id,
                redact_text(str(exc)),
            )
            await repo.add_source_if_missing(
                document_id=None,
                account_id=account.id,
                uid=email_data.uid,
                folder=source_folder,
                part_id=attachment.part_id,
                message_id=email_data.message_id,
                thread_id=thread_id,
                from_email=email_data.from_email,
                subject=email_data.subject,
                received_at=received_at,
                source_filename=attachment.filename,
                mime_type=attachment.mime_type,
                size_bytes=attachment.size,
                disposition=attachment.disposition,
                ingestion_status="failed",
                safety_reason="ingestion_failed",
            )
