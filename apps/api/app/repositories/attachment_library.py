"""Permission-aware queries and persistence for the global attachment library."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, or_, select
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
