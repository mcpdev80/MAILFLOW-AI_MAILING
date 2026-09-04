"""Compact security and lifecycle events for destructive resource changes."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk


class LifecycleEvent(Base):
    __tablename__ = "lifecycle_events"
    __table_args__ = (
        Index("ix_lifecycle_events_org_created", "org_id", "created_at"),
        Index("ix_lifecycle_events_account", "account_id", "created_at"),
    )

    id: Mapped[UUID] = uuid_pk()
    org_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE")
    )
    # Deliberately no FK: mailbox deletion must leave one compact tombstone.
    account_id: Mapped[UUID | None] = mapped_column(nullable=True)
    actor_user_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    event: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
