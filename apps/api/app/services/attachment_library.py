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
from app.llm_runtime import build_llm_client
from app.models.attachment_library import AttachmentMemory, AttachmentPlacement
from app.models.email_account import EmailAccount
from app.models.llm_provider import LLMProvider
from app.models.mailbox_access import MailboxAccess
from app.repositories.attachment_library import AttachmentLibraryRepository
from app.secrets import redact_text
from app.services.attachment_document_ai import analyze_attachment_document

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


def _should_run_document_ai(*, document_type: str, confidence: float, extracted_text: str | None) -> bool:
    if confidence >= attachment_library_settings.ATTACHMENT_LIBRARY_AI_THRESHOLD:
        return False
    if len((extracted_text or "").strip()) < attachment_library_settings.ATTACHMENT_LIBRARY_AI_MIN_TEXT_CHARS:
        return False
    return document_type in {"pdf_document", "document", "image"}


async def _load_document_client(session: AsyncSession, account: EmailAccount):
    if account.llm_provider_id is None:
        return None
    provider = await session.get(LLMProvider, account.llm_provider_id)
    if provider is None:
        return None
    return build_llm_client(
        provider,
        for_generation=False,
        account_id=account.id,
    )


async def _attachment_owner_scopes(
    session: AsyncSession,
    account: EmailAccount,
) -> list[str]:
    if account.ownership_mode == "private" and account.owner_user_id:
        return [account.owner_user_id]
    if account.ownership_mode != "shared":
        return []
    return list(
        (
            await session.execute(
                select(MailboxAccess.user_id).where(
                    MailboxAccess.account_id == account.id,
                    MailboxAccess.can_use.is_(True),
                )
            )
        ).scalars()
    )


async def _apply_attachment_memory(
    session: AsyncSession,
    *,
    account: EmailAccount,
    document_id,
    sender_email: str,
    filename: str,
    mime_type: str,
    document_type: str | None,
) -> None:
    """Apply learned folder rules independently for every authorized user scope.

    Private mailboxes have one owner scope. Shared mailboxes fan out only to users
    with an explicit can_use grant. Each placement remains per-user, so one user's
    learned organization can never alter another user's view of the same binary.
    """
    owner_scopes = await _attachment_owner_scopes(session, account)
    if not owner_scopes:
        return

    sender = sender_email.strip().lower()
    sender_domain = sender.rsplit("@", 1)[1] if "@" in sender else None
    filename_lower = filename.lower()

    for owner_scope in owner_scopes:
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
            continue

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
            continue

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
    are intentionally never fetched into the global library. Safe documents start
    with cheap metadata derived from the already-computed mail classification. Only
    ambiguous text-bearing documents receive one focused document-model request.
    """
    if not attachment_library_settings.ATTACHMENT_LIBRARY_ENABLED:
        return
    if not email_data.attachments:
        return

    repo = AttachmentLibraryRepository(session)
    spam_verdict = email_data.auth_signals.spam_verdict
    received_at = _received_at(email_data.date)
    document_client = None
    document_client_loaded = False

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

                if _should_run_document_ai(
                    document_type=metadata.document_type,
                    confidence=metadata.confidence,
                    extracted_text=extracted_text,
                ):
                    if not document_client_loaded:
                        document_client = await _load_document_client(session, account)
                        document_client_loaded = True
                    if document_client is not None:
                        try:
                            ai = analyze_attachment_document(
                                document_client,
                                filename=attachment.filename,
                                mime_type=attachment.mime_type,
                                extracted_text=extracted_text,
                                email_category=classification.category,
                                email_subcategory=classification.subcategory,
                                sender=email_data.from_email,
                                subject=email_data.subject,
                            )
                            if ai.confidence >= metadata.confidence:
                                document.document_type = ai.document_type
                                document.ai_category = ai.category
                                document.ai_subcategory = ai.subcategory
                                document.ai_confidence = ai.confidence
                                document.ai_tags = list(
                                    dict.fromkeys([*metadata.tags, *ai.tags])
                                )
                        except Exception as exc:  # focused AI is optional
                            log.warning(
                                "Attachment document AI skipped for account=%s uid=%s part=%s: %s",
                                account.id,
                                email_data.uid,
                                attachment.part_id,
                                redact_text(str(exc)),
                            )

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
                await _apply_attachment_memory(
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
