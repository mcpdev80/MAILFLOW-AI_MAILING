"""Attachment-library ingestion integrated with normal mailbox processing."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from uuid import uuid4

from mailflow_core.attachment_library import (
    decide_attachment_ingestion,
    derive_document_metadata,
)
from mailflow_core.attachments import AttachmentExtractionConfig, extract_attachment
from mailflow_core.providers.base import EmailData, EmailProvider
from mailflow_core.types import ClassificationResult
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.attachment_library_config import attachment_library_settings
from app.attachment_storage import AttachmentStorage, attachment_storage
from app.models.attachment_library import AttachmentMemory, AttachmentPlacement
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


async def _apply_private_attachment_memory(
    session: AsyncSession,
    *,
    account: EmailAccount,
    document_id,
    sender_email: str,
    filename: str,
    mime_type: str,
    document_type: str | None,
) -> None:
    """Apply one learned folder rule when a mailbox has exactly one owner.

    Shared mailboxes intentionally do not get an implicit per-user placement here:
    several users can organize the same deduplicated binary differently. Their
    explicit corrections remain isolated by owner_scope.
    """
    if account.ownership_mode != "private" or not account.owner_user_id:
        return

    owner_scope = account.owner_user_id
    sender = sender_email.strip().lower()
    sender_domain = sender.rsplit("@", 1)[1] if "@" in sender else None
    memories = list(
        (
            await session.execute(
                select(AttachmentMemory)
                .where(
                    AttachmentMemory.org_id == account.org_id,
                    AttachmentMemory.owner_scope == owner_scope,
                    AttachmentMemory.active.is_(True),
                )
                .order_by(AttachmentMemory.updated_at.desc())
            )
        ).scalars()
    )

    filename_lower = filename.lower()
    matching: list[AttachmentMemory] = []
    for memory in memories:
        if memory.sender_email and memory.sender_email.lower() != sender:
            continue
        if memory.sender_domain and memory.sender_domain.lower() != sender_domain:
            continue
        if memory.mime_type and memory.mime_type.lower() != mime_type.lower():
            continue
        if memory.document_type and memory.document_type != document_type:
            continue
        if memory.filename_pattern and memory.filename_pattern.lower() not in filename_lower:
            continue
        matching.append(memory)

    if not matching:
        return

    def specificity(memory: AttachmentMemory) -> int:
        return sum(
            value is not None
            for value in (
                memory.sender_email,
                memory.sender_domain,
                memory.filename_pattern,
                memory.mime_type,
                memory.document_type,
            )
        )

    memory = max(matching, key=specificity)
    existing = (
        await session.execute(
            select(AttachmentPlacement).where(
                AttachmentPlacement.document_id == document_id,
                AttachmentPlacement.owner_scope == owner_scope,
            )
        )
    ).scalar_one_or_none()
    if existing is not None and existing.corrected:
        return

    await session.execute(
        pg_insert(AttachmentPlacement)
        .values(
            id=uuid4(),
            document_id=document_id,
            org_id=account.org_id,
            owner_scope=owner_scope,
            folder_id=memory.folder_id,
            category_override=None,
            subcategory_override=None,
            user_tags=[],
            corrected=False,
        )
        .on_conflict_do_update(
            index_elements=["document_id", "owner_scope"],
            set_={"folder_id": memory.folder_id, "corrected": False},
        )
    )
    memory.usage_count += 1


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
    are intentionally never fetched into the global library. Safe documents get
    initial organization metadata from the already-computed message AI context,
    avoiding a second LLM request during ingestion.
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
            extracted_text = _extracted_text(attachment, payload)
            document = await repo.get_or_create_document(
                org_id=account.org_id,
                content_sha256=stored.content_sha256,
                storage_key=stored.storage_key,
                canonical_filename=attachment.filename,
                mime_type=attachment.mime_type,
                size_bytes=stored.size_bytes,
                extracted_text=extracted_text,
            )

            # Deduplicated documents are classified once. A second source mapping
            # must not silently overwrite existing global AI metadata.
            if document.analysis_status == "pending":
                metadata = derive_document_metadata(
                    attachment,
                    classification=classification,
                    extracted_text=extracted_text,
                )
                document.document_type = metadata.document_type
                document.ai_category = metadata.category
                document.ai_subcategory = metadata.subcategory
                document.ai_confidence = metadata.confidence
                document.ai_tags = list(metadata.tags)
                document.analysis_status = "ready"

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
            try:
                await _apply_private_attachment_memory(
                    session,
                    account=account,
                    document_id=document.id,
                    sender_email=email_data.from_email,
                    filename=attachment.filename,
                    mime_type=attachment.mime_type,
                    document_type=document.document_type,
                )
            except Exception as exc:  # learned organization is optional
                log.warning(
                    "Attachment memory application skipped for account=%s uid=%s part=%s: %s",
                    account.id,
                    email_data.uid,
                    attachment.part_id,
                    redact_text(str(exc)),
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
