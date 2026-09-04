"""Trusted mailbox-scoped classification decisions for conservative reuse."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk


class DecisionMemoryEntry(Base):
    __tablename__ = "decision_memory_entries"
    __table_args__ = (
        Index("ix_decision_memory_account_enabled", "account_id", "enabled"),
        Index("ix_decision_memory_sender", "account_id", "sender_email"),
        Index("ix_decision_memory_domain", "account_id", "sender_domain"),
        Index("ix_decision_memory_thread", "account_id", "thread_id"),
    )

    id: Mapped[UUID] = uuid_pk()
    account_id: Mapped[UUID] = mapped_column(
        ForeignKey("email_accounts.id", ondelete="CASCADE")
    )
    sender_email: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sender_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subject_pattern: Mapped[str | None] = mapped_column(String(500), nullable=True)
    thread_id: Mapped[str | None] = mapped_column(String(500), nullable=True)

    category: Mapped[str] = mapped_column(String(64))
    subcategory: Mapped[str | None] = mapped_column(String(255), nullable=True)
    importance: Mapped[str] = mapped_column(String(32))
    urgency: Mapped[str] = mapped_column(String(32))
    action_required: Mapped[str] = mapped_column(String(16))
    system_tags: Mapped[list[str]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    user_tags: Mapped[list[str]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    routing_target: Mapped[str | None] = mapped_column(String(255), nullable=True)

    source: Mapped[str] = mapped_column(String(32))
    trust_score: Mapped[float] = mapped_column(Float, default=1.0, server_default="1")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    hit_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_used: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    superseded_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("decision_memory_entries.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
