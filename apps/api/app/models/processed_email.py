"""Processed email state and persisted semantic classification."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk


class ProcessedEmail(Base):
    __tablename__ = "processed_emails"
    __table_args__ = (
        UniqueConstraint("account_id", "uid", "uidvalidity", name="uq_processed_email"),
        Index("ix_processed_email_msg_id", "account_id", "message_id"),
        Index("ix_processed_email_thread", "account_id", "thread_id"),
        Index("ix_processed_email_category", "account_id", "category"),
        Index("ix_processed_email_review", "account_id", "review_required"),
    )

    id: Mapped[UUID] = uuid_pk()
    account_id: Mapped[UUID] = mapped_column(
        ForeignKey("email_accounts.id", ondelete="CASCADE")
    )
    uid: Mapped[int] = mapped_column(BigInteger)
    folder: Mapped[str] = mapped_column(String(255))
    uidvalidity: Mapped[int] = mapped_column(BigInteger)
    message_id: Mapped[str | None] = mapped_column(String(500), nullable=True)
    thread_id: Mapped[str | None] = mapped_column(String(500), nullable=True)
    from_email: Mapped[str] = mapped_column(String(500))
    subject: Mapped[str] = mapped_column(String, default="")

    destination_folder: Mapped[str] = mapped_column(String(255))
    classification_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    category: Mapped[str] = mapped_column(
        String(64), default="other", server_default="other"
    )
    subcategory: Mapped[str | None] = mapped_column(String(255), nullable=True)
    suggested_category: Mapped[str | None] = mapped_column(String(255), nullable=True)
    suggested_subcategory: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    importance: Mapped[str] = mapped_column(
        String(32), default="unknown", server_default="unknown"
    )
    urgency: Mapped[str] = mapped_column(
        String(32), default="unknown", server_default="unknown"
    )
    action_required: Mapped[str] = mapped_column(
        String(16), default="unknown", server_default="unknown"
    )
    system_tags: Mapped[list[str]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    user_tags: Mapped[list[str]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    confidence: Mapped[float] = mapped_column(Float)
    needs_more_context: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    review_required: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    suspicious_content: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    reason: Mapped[str | None] = mapped_column(String(300), nullable=True)
    classification_stage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    classification_model: Mapped[str | None] = mapped_column(String(200), nullable=True)
    decision_memory_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("decision_memory_entries.id", ondelete="SET NULL"), nullable=True
    )
    decision_memory_match_confidence: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    decision_memory_hint_used: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )

    auth_spf: Mapped[str] = mapped_column(
        String(16), default="unknown", server_default="unknown"
    )
    auth_dkim: Mapped[str] = mapped_column(
        String(16), default="unknown", server_default="unknown"
    )
    auth_dmarc: Mapped[str] = mapped_column(
        String(20), default="unknown", server_default="unknown"
    )
    auth_arc: Mapped[str] = mapped_column(
        String(16), default="unknown", server_default="unknown"
    )
    spam_verdict: Mapped[str] = mapped_column(
        String(16), default="unknown", server_default="unknown"
    )
    spam_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    method: Mapped[str] = mapped_column(String(50))
    draft_saved: Mapped[bool] = mapped_column(Boolean, default=False)
    cycle_id: Mapped[UUID] = mapped_column(
        ForeignKey("audit_log.cycle_id", ondelete="CASCADE")
    )
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
