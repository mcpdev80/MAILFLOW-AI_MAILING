"""Compact per-thread context used for reply-aware classification."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
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


class ThreadSummary(Base):
    __tablename__ = "thread_summaries"
    __table_args__ = (
        UniqueConstraint(
            "account_id", "thread_id", name="uq_thread_summary_account_thread"
        ),
        Index("ix_thread_summary_subject", "account_id", "subject_key"),
        Index("ix_thread_summary_last_message", "account_id", "last_message_id"),
    )

    id: Mapped[UUID] = uuid_pk()
    account_id: Mapped[UUID] = mapped_column(
        ForeignKey("email_accounts.id", ondelete="CASCADE")
    )
    thread_id: Mapped[str] = mapped_column(String(500))
    summary: Mapped[str] = mapped_column(Text, default="", server_default="")
    # Internal matching key required for the final low-confidence fallback.
    subject_key: Mapped[str] = mapped_column(String(500), default="", server_default="")
    last_message_id: Mapped[str | None] = mapped_column(String(500), nullable=True)
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    message_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    participants: Mapped[list[str]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    open_action_required: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    deadline: Mapped[str | None] = mapped_column(String(255), nullable=True)
