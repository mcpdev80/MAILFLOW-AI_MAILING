"""add resumable historical backfill state

Revision ID: 017
Revises: 016
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "backfill_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("folder", sa.String(length=255), nullable=False),
        sa.Column(
            "state", sa.String(length=16), server_default="paused", nullable=False
        ),
        sa.Column("batch_size", sa.Integer(), server_default="10", nullable=False),
        sa.Column("uidvalidity", sa.BigInteger(), nullable=True),
        sa.Column("cursor_uid", sa.BigInteger(), nullable=True),
        sa.Column("total_discovered", sa.Integer(), server_default="0", nullable=False),
        sa.Column("processed", sa.Integer(), server_default="0", nullable=False),
        sa.Column("successful", sa.Integer(), server_default="0", nullable=False),
        sa.Column("review_required", sa.Integer(), server_default="0", nullable=False),
        sa.Column("failed", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_error", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "state IN ('running','paused','completed','cancelled','failed')",
            name="ck_backfill_jobs_state",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"], ["email_accounts.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_backfill_jobs_account_id", "backfill_jobs", ["account_id"])
    op.create_index(
        "ix_backfill_jobs_account", "backfill_jobs", ["account_id", "created_at"]
    )
    op.create_index("ix_backfill_jobs_state", "backfill_jobs", ["state", "updated_at"])
    op.create_index(
        "uq_backfill_jobs_active_account_folder",
        "backfill_jobs",
        ["account_id", "folder"],
        unique=True,
        postgresql_where=sa.text("state IN ('running','paused')"),
    )

    op.create_table(
        "backfill_failures",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=False),
        sa.Column("uidvalidity", sa.BigInteger(), nullable=False),
        sa.Column("uid", sa.BigInteger(), nullable=False),
        sa.Column(
            "status", sa.String(length=16), server_default="failed", nullable=False
        ),
        sa.Column("attempts", sa.Integer(), server_default="1", nullable=False),
        sa.Column("classification_stage", sa.Integer(), nullable=True),
        sa.Column(
            "review_required", sa.Boolean(), server_default="false", nullable=False
        ),
        sa.Column("last_error", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('failed','review','retrying','resolved')",
            name="ck_backfill_failures_status",
        ),
        sa.ForeignKeyConstraint(["job_id"], ["backfill_jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "job_id", "uidvalidity", "uid", name="uq_backfill_failure_position"
        ),
    )
    op.create_index("ix_backfill_failures_job_id", "backfill_failures", ["job_id"])
    op.create_index(
        "ix_backfill_failures_job_status", "backfill_failures", ["job_id", "status"]
    )


def downgrade() -> None:
    op.drop_index("ix_backfill_failures_job_status", table_name="backfill_failures")
    op.drop_index("ix_backfill_failures_job_id", table_name="backfill_failures")
    op.drop_table("backfill_failures")

    op.drop_index("uq_backfill_jobs_active_account_folder", table_name="backfill_jobs")
    op.drop_index("ix_backfill_jobs_state", table_name="backfill_jobs")
    op.drop_index("ix_backfill_jobs_account", table_name="backfill_jobs")
    op.drop_index("ix_backfill_jobs_account_id", table_name="backfill_jobs")
    op.drop_table("backfill_jobs")
