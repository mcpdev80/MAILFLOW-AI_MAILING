"""Persisted outbound draft state for user-controlled mail sending."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, uuid_pk


class OutboundDraft(Base):
    __tablename__ = "outbound_drafts"
    __table_args__ = (
        CheckConstraint(
            "message_type IN ('new', 'reply', 'reply_all', 'forward')",
            name="ck_outbound_drafts_message_type",
        ),
        CheckConstraint(
            "editor_mode IN ('rich_text', 'markdown')",
            name="ck_outbound_drafts_editor_mode",
        ),
        CheckConstraint(
            "status IN ('draft', 'sending', 'sent', 'failed', 'discarded')",
            name="ck_outbound_drafts_status",
        ),
    )

    id: Mapped[UUID] = uuid_pk()
    org_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    account_id: Mapped[UUID] = mapped_column(
        ForeignKey("email_accounts.id", ondelete="CASCADE"), index=True
    )
    owner_user_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )

    message_type: Mapped[str] = mapped_column(
        String(16), default="new", server_default="new"
    )
    in_reply_to: Mapped[str | None] = mapped_column(String(998), nullable=True)
    references: Mapped[list[str]] = mapped_column(
        JSON, default=list, server_default="[]"
    )

    to_recipients: Mapped[list[str]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    cc_recipients: Mapped[list[str]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    bcc_recipients: Mapped[list[str]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    subject: Mapped[str] = mapped_column(String(998), default="", server_default="")
    body_text: Mapped[str] = mapped_column(Text, default="", server_default="")
    body_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    editor_mode: Mapped[str] = mapped_column(
        String(16), default="rich_text", server_default="rich_text"
    )

    status: Mapped[str] = mapped_column(
        String(16), default="draft", server_default="draft"
    )
    send_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    sent_message_id: Mapped[str | None] = mapped_column(String(998), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    attachments: Mapped[list[OutboundDraftAttachment]] = relationship(
        "OutboundDraftAttachment",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="OutboundDraftAttachment.created_at",
    )


class OutboundDraftAttachment(Base):
    __tablename__ = "outbound_draft_attachments"

    id: Mapped[UUID] = uuid_pk()
    draft_id: Mapped[UUID] = mapped_column(
        ForeignKey("outbound_drafts.id", ondelete="CASCADE"), index=True
    )
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(255))
    size_bytes: Mapped[int] = mapped_column(Integer)
    content: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
