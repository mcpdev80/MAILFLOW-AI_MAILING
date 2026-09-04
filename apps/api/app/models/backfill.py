"""Persistent historical mailbox backfill checkpoints and isolated failures."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk


class BackfillJob(Base):
    """Compact restart-safe checkpoint for one account/folder history scan."""

    __tablename__ = "backfill_jobs"
    __table_args__ = (
        CheckConstraint(
            "state IN ('running','paused','completed','cancelled','failed')",
            name="ck_backfill_jobs_state",
        ),
        Index("ix_backfill_jobs_account", "account_id", "created_at"),
        Index("ix_backfill_jobs_state", "state", "updated_at"),
        Index(
            "uq_backfill_jobs_active_account_folder",
            "account_id",
            "folder",
            unique=True,
            postgresql_where=text("state IN ('running','paused')"),
        ),
    )

    id: Mapped[UUID] = uuid_pk()
    account_id: Mapped[UUID] = mapped_column(
        ForeignKey("email_accounts.id", ondelete="CASCADE"), index=True
    )
    folder: Mapped[str] = mapped_column(String(255), default="INBOX")
    state: Mapped[str] = mapped_column(
        String(16), default="paused", server_default="paused"
    )
    batch_size: Mapped[int] = mapped_column(Integer, default=10, server_default="10")

    uidvalidity: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    cursor_uid: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    total_discovered: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )
    processed: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    successful: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    review_required: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    failed: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class BackfillFailure(Base):
    """Only failed/reviewable historical messages need per-message retry state."""

    __tablename__ = "backfill_failures"
    __table_args__ = (
        UniqueConstraint(
            "job_id",
            "uidvalidity",
            "uid",
            name="uq_backfill_failure_position",
        ),
        CheckConstraint(
            "status IN ('failed','review','retrying','resolved')",
            name="ck_backfill_failures_status",
        ),
        Index("ix_backfill_failures_job_status", "job_id", "status"),
    )

    id: Mapped[UUID] = uuid_pk()
    job_id: Mapped[UUID] = mapped_column(
        ForeignKey("backfill_jobs.id", ondelete="CASCADE"), index=True
    )
    uidvalidity: Mapped[int] = mapped_column(BigInteger)
    uid: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(
        String(16), default="failed", server_default="failed"
    )
    attempts: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    classification_stage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    review_required: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
