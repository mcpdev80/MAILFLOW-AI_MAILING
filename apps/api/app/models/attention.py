"""Compact per-user notification state for the attention center."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"
    __table_args__ = (
        UniqueConstraint("org_id", "user_key", name="uq_notification_preferences_actor"),
    )

    id: Mapped[UUID] = uuid_pk()
    org_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    user_key: Mapped[str] = mapped_column(String(255))
    urgent_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    security_review_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    jobs_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    mailbox_health_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    daily_summary_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    daily_summary_hour: Mapped[int] = mapped_column(Integer, default=8, server_default="8")
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", server_default="UTC")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class NotificationEvent(Base):
    __tablename__ = "notification_events"
    __table_args__ = (
        UniqueConstraint("org_id", "user_key", "dedupe_key", name="uq_notification_event_dedupe"),
        Index("ix_notification_event_actor_read", "org_id", "user_key", "read_at"),
        Index("ix_notification_event_actor_created", "org_id", "user_key", "created_at"),
    )

    id: Mapped[UUID] = uuid_pk()
    org_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    user_key: Mapped[str] = mapped_column(String(255))
    account_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("email_accounts.id", ondelete="CASCADE"), nullable=True
    )
    source_email_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("processed_emails.id", ondelete="CASCADE"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(64))
    severity: Mapped[str] = mapped_column(String(16), default="info", server_default="info")
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(String(500), default="", server_default="")
    dedupe_key: Mapped[str] = mapped_column(String(500))
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}")
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
