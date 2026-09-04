"""Immutable bulk-classification proposals and resumable apply jobs."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk


class BulkProposal(Base):
    __tablename__ = "bulk_proposals"
    __table_args__ = (
        UniqueConstraint(
            "job_id", "uidvalidity", "uid", name="uq_bulk_proposal_position"
        ),
        CheckConstraint(
            "status IN ('proposed','excluded','approved','applying','applied','skipped','failed','review')",
            name="ck_bulk_proposals_status",
        ),
        Index("ix_bulk_proposals_job_status", "job_id", "status"),
        Index("ix_bulk_proposals_account", "account_id", "created_at"),
    )

    id: Mapped[UUID] = uuid_pk()
    job_id: Mapped[UUID] = mapped_column(
        ForeignKey("backfill_jobs.id", ondelete="CASCADE"), index=True
    )
    account_id: Mapped[UUID] = mapped_column(
        ForeignKey("email_accounts.id", ondelete="CASCADE"), index=True
    )
    source_folder: Mapped[str] = mapped_column(String(255))
    uidvalidity: Mapped[int] = mapped_column(BigInteger)
    uid: Mapped[int] = mapped_column(BigInteger)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    status: Mapped[str] = mapped_column(
        String(16), default="proposed", server_default="proposed"
    )
    original_snapshot: Mapped[dict] = mapped_column(JSON)
    edited_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    approved_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    approval_user_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    applied_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class BulkApplyJob(Base):
    __tablename__ = "bulk_apply_jobs"
    __table_args__ = (
        UniqueConstraint("source_job_id", name="uq_bulk_apply_job_source"),
        CheckConstraint(
            "state IN ('running','paused','completed','cancelled','failed')",
            name="ck_bulk_apply_jobs_state",
        ),
        Index("ix_bulk_apply_jobs_account", "account_id", "created_at"),
        Index("ix_bulk_apply_jobs_state", "state", "updated_at"),
    )

    id: Mapped[UUID] = uuid_pk()
    source_job_id: Mapped[UUID] = mapped_column(
        ForeignKey("backfill_jobs.id", ondelete="CASCADE"), unique=True
    )
    account_id: Mapped[UUID] = mapped_column(
        ForeignKey("email_accounts.id", ondelete="CASCADE"), index=True
    )
    state: Mapped[str] = mapped_column(
        String(16), default="paused", server_default="paused"
    )
    batch_size: Mapped[int] = mapped_column(Integer, default=10, server_default="10")
    cursor_id: Mapped[UUID | None] = mapped_column(nullable=True)
    approved: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    processed: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    applied: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    skipped: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    failed: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    review_required: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
