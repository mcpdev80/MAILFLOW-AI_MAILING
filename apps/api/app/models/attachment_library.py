"""Persistent attachment library models for deduplicated document storage."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk


class AttachmentFolder(Base):
    """Per-user virtual folder; files are never physically copied between folders."""

    __tablename__ = "attachment_folders"
    __table_args__ = (
        CheckConstraint(
            "managed_by IN ('ai', 'user')",
            name="ck_attachment_folders_managed_by",
        ),
        UniqueConstraint(
            "org_id",
            "owner_scope",
            "parent_id",
            "name",
            name="uq_attachment_folder_sibling_name",
        ),
        Index("ix_attachment_folders_owner", "org_id", "owner_scope"),
    )

    id: Mapped[UUID] = uuid_pk()
    org_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE")
    )
    # Better Auth user id; legacy single-tenant mode uses the literal "__single__".
    owner_scope: Mapped[str] = mapped_column(String(255))
    parent_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("attachment_folders.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255))
    managed_by: Mapped[str] = mapped_column(
        String(16), default="ai", server_default="ai"
    )
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AttachmentDocument(Base):
    """One stored binary per organization/content hash, regardless of source count."""

    __tablename__ = "attachment_documents"
    __table_args__ = (
        UniqueConstraint(
            "org_id", "content_sha256", name="uq_attachment_document_org_hash"
        ),
        CheckConstraint(
            "analysis_status IN ('pending', 'ready', 'failed')",
            name="ck_attachment_documents_analysis_status",
        ),
        CheckConstraint(
            "ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)",
            name="ck_attachment_documents_ai_confidence",
        ),
        Index("ix_attachment_documents_org_created", "org_id", "created_at"),
        Index("ix_attachment_documents_org_category", "org_id", "ai_category"),
    )

    id: Mapped[UUID] = uuid_pk()
    org_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE")
    )
    content_sha256: Mapped[str] = mapped_column(String(64))
    storage_key: Mapped[str] = mapped_column(String(255))
    canonical_filename: Mapped[str] = mapped_column(String(500))
    mime_type: Mapped[str] = mapped_column(String(255))
    size_bytes: Mapped[int] = mapped_column(Integer)
    analysis_status: Mapped[str] = mapped_column(
        String(16), default="pending", server_default="pending"
    )
    document_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ai_category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ai_subcategory: Mapped[str | None] = mapped_column(String(150), nullable=True)
    ai_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_tags: Mapped[list[str]] = mapped_column(JSON, default=list, server_default="[]")
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AttachmentPlacement(Base):
    """Per-user organization overrides for one otherwise shared/deduplicated document."""

    __tablename__ = "attachment_placements"
    __table_args__ = (
        UniqueConstraint(
            "document_id", "owner_scope", name="uq_attachment_placement_owner"
        ),
        Index("ix_attachment_placements_owner", "org_id", "owner_scope"),
        Index("ix_attachment_placements_folder", "folder_id"),
    )

    id: Mapped[UUID] = uuid_pk()
    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("attachment_documents.id", ondelete="CASCADE")
    )
    org_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE")
    )
    owner_scope: Mapped[str] = mapped_column(String(255))
    folder_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("attachment_folders.id", ondelete="SET NULL"), nullable=True
    )
    category_override: Mapped[str | None] = mapped_column(String(100), nullable=True)
    subcategory_override: Mapped[str | None] = mapped_column(String(150), nullable=True)
    user_tags: Mapped[list[str]] = mapped_column(JSON, default=list, server_default="[]")
    corrected: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AttachmentSource(Base):
    """One observed attachment in one email; may be blocked/ignored without a stored blob."""

    __tablename__ = "attachment_sources"
    __table_args__ = (
        UniqueConstraint(
            "account_id",
            "folder",
            "uid",
            "part_id",
            name="uq_attachment_source_location",
        ),
        CheckConstraint(
            "ingestion_status IN ('stored', 'ignored', 'blocked', 'unsupported', 'failed')",
            name="ck_attachment_sources_ingestion_status",
        ),
        Index("ix_attachment_sources_document", "document_id"),
        Index("ix_attachment_sources_account", "account_id", "created_at"),
        Index("ix_attachment_sources_status", "ingestion_status"),
    )

    id: Mapped[UUID] = uuid_pk()
    document_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("attachment_documents.id", ondelete="CASCADE"), nullable=True
    )
    account_id: Mapped[UUID] = mapped_column(
        ForeignKey("email_accounts.id", ondelete="CASCADE")
    )
    uid: Mapped[int] = mapped_column(BigInteger)
    folder: Mapped[str] = mapped_column(String(500))
    part_id: Mapped[str] = mapped_column(String(255))
    message_id: Mapped[str | None] = mapped_column(String(500), nullable=True)
    thread_id: Mapped[str | None] = mapped_column(String(500), nullable=True)
    from_email: Mapped[str] = mapped_column(String(500))
    subject: Mapped[str] = mapped_column(Text, default="", server_default="")
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source_filename: Mapped[str] = mapped_column(String(500))
    mime_type: Mapped[str] = mapped_column(String(255))
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    disposition: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ingestion_status: Mapped[str] = mapped_column(String(20))
    safety_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AttachmentMemory(Base):
    """Per-user learned organization rule for future similar documents."""

    __tablename__ = "attachment_memory"
    __table_args__ = (
        Index("ix_attachment_memory_owner", "org_id", "owner_scope", "active"),
    )

    id: Mapped[UUID] = uuid_pk()
    org_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE")
    )
    owner_scope: Mapped[str] = mapped_column(String(255))
    folder_id: Mapped[UUID] = mapped_column(
        ForeignKey("attachment_folders.id", ondelete="CASCADE")
    )
    sender_email: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sender_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    filename_pattern: Mapped[str | None] = mapped_column(String(500), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    document_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    usage_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
