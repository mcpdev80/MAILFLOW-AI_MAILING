"""Permission-aware queries and persistence for the global attachment library."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity
from app.mailbox_access import access_condition
from app.models.attachment_library import AttachmentDocument, AttachmentSource
from app.models.email_account import EmailAccount


class AttachmentLibraryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def find_document_by_hash(
        self, org_id: UUID, content_sha256: str
    ) -> AttachmentDocument | None:
        return (
            await self.session.execute(
                select(AttachmentDocument).where(
                    AttachmentDocument.org_id == org_id,
                    AttachmentDocument.content_sha256 == content_sha256,
                )
            )
        ).scalar_one_or_none()

    async def get_or_create_document(
        self,
        *,
        org_id: UUID,
        content_sha256: str,
        storage_key: str,
        canonical_filename: str,
        mime_type: str,
        size_bytes: int,
        extracted_text: str | None = None,
    ) -> AttachmentDocument:
        document_id = uuid4()
        await self.session.execute(
            pg_insert(AttachmentDocument)
            .values(
                id=document_id,
                org_id=org_id,
                content_sha256=content_sha256,
                storage_key=storage_key,
                canonical_filename=canonical_filename,
                mime_type=mime_type,
                size_bytes=size_bytes,
                extracted_text=extracted_text,
                analysis_status="pending",
                tags=[],
            )
            .on_conflict_do_nothing(
                index_elements=["org_id", "content_sha256"]
            )
        )
        document = await self.find_document_by_hash(org_id, content_sha256)
        if document is None:
            raise RuntimeError("attachment_document_upsert_failed")
        return document

    async def find_source(
        self, account_id: UUID, folder: str, uid: int, part_id: str
    ) -> AttachmentSource | None:
        return (
            await self.session.execute(
                select(AttachmentSource).where(
                    AttachmentSource.account_id == account_id,
                    AttachmentSource.folder == folder,
                    AttachmentSource.uid == uid,
                    AttachmentSource.part_id == part_id,
                )
            )
        ).scalar_one_or_none()

    async def add_source_if_missing(
        self,
        *,
        document_id: UUID | None,
        account_id: UUID,
        uid: int,
        folder: str,
        part_id: str,
        message_id: str | None,
        thread_id: str | None,
        from_email: str,
        subject: str,
        received_at: datetime | None,
        source_filename: str,
        mime_type: str,
        size_bytes: int | None,
        disposition: str | None,
        ingestion_status: str,
        safety_reason: str | None,
    ) -> None:
        await self.session.execute(
            pg_insert(AttachmentSource)
            .values(
                id=uuid4(),
                document_id=document_id,
                account_id=account_id,
                uid=uid,
                folder=folder,
                part_id=part_id,
                message_id=message_id,
                thread_id=thread_id,
                from_email=from_email,
                subject=subject,
                received_at=received_at,
                source_filename=source_filename,
                mime_type=mime_type,
                size_bytes=size_bytes,
                disposition=disposition,
                ingestion_status=ingestion_status,
                safety_reason=safety_reason,
            )
            .on_conflict_do_nothing(
                index_elements=["account_id", "folder", "uid", "part_id"]
            )
        )

    async def list_accessible_documents(
        self,
        identity: RequestIdentity,
        *,
        query: str | None = None,
        account_id: UUID | None = None,
        category: str | None = None,
        mime_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[tuple[AttachmentDocument, int]]:
        statement = (
            select(AttachmentDocument, func.count(AttachmentSource.id).label("source_count"))
            .join(AttachmentSource, AttachmentSource.document_id == AttachmentDocument.id)
            .join(EmailAccount, EmailAccount.id == AttachmentSource.account_id)
            .where(
                AttachmentSource.ingestion_status == "stored",
                access_condition(identity),
            )
            .group_by(AttachmentDocument.id)
            .order_by(AttachmentDocument.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        if account_id is not None:
            statement = statement.where(AttachmentSource.account_id == account_id)
        if category:
            statement = statement.where(AttachmentDocument.ai_category == category)
        if mime_type:
            statement = statement.where(AttachmentDocument.mime_type == mime_type)
        if query and query.strip():
            pattern = f"%{query.strip()}%"
            statement = statement.where(
                or_(
                    AttachmentDocument.canonical_filename.ilike(pattern),
                    AttachmentDocument.extracted_text.ilike(pattern),
                    AttachmentSource.from_email.ilike(pattern),
                    AttachmentSource.subject.ilike(pattern),
                )
            )
        rows = await self.session.execute(statement)
        return [(row[0], int(row[1])) for row in rows.all()]

    async def get_accessible_document(
        self, identity: RequestIdentity, document_id: UUID
    ) -> tuple[AttachmentDocument, list[AttachmentSource]] | None:
        document = (
            await self.session.execute(
                select(AttachmentDocument)
                .join(AttachmentSource, AttachmentSource.document_id == AttachmentDocument.id)
                .join(EmailAccount, EmailAccount.id == AttachmentSource.account_id)
                .where(
                    AttachmentDocument.id == document_id,
                    AttachmentSource.ingestion_status == "stored",
                    access_condition(identity),
                )
                .distinct()
            )
        ).scalar_one_or_none()
        if document is None:
            return None
        sources = list(
            (
                await self.session.execute(
                    select(AttachmentSource)
                    .join(EmailAccount, EmailAccount.id == AttachmentSource.account_id)
                    .where(
                        AttachmentSource.document_id == document.id,
                        AttachmentSource.ingestion_status == "stored",
                        access_condition(identity),
                    )
                    .order_by(AttachmentSource.created_at.desc())
                )
            ).scalars()
        )
        return document, sources

    async def list_accessible_blocked_sources(
        self,
        identity: RequestIdentity,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> list[AttachmentSource]:
        return list(
            (
                await self.session.execute(
                    select(AttachmentSource)
                    .join(EmailAccount, EmailAccount.id == AttachmentSource.account_id)
                    .where(
                        AttachmentSource.ingestion_status == "blocked",
                        access_condition(identity),
                    )
                    .order_by(AttachmentSource.created_at.desc())
                    .limit(limit)
                    .offset(offset)
                )
            ).scalars()
        )
