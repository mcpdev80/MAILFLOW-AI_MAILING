"""add dry-run proposal snapshots and resumable apply jobs

Revision ID: 019
Revises: 018
"""

from alembic import op
import sqlalchemy as sa

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "backfill_jobs",
        sa.Column("mode", sa.String(length=16), nullable=False, server_default="apply"),
    )
    op.create_check_constraint(
        "ck_backfill_jobs_mode",
        "backfill_jobs",
        "mode IN ('dry_run','review','apply')",
    )

    op.create_table(
        "bulk_proposals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("source_folder", sa.String(length=255), nullable=False),
        sa.Column("uidvalidity", sa.BigInteger(), nullable=False),
        sa.Column("uid", sa.BigInteger(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="proposed"),
        sa.Column("original_snapshot", sa.JSON(), nullable=False),
        sa.Column("edited_snapshot", sa.JSON(), nullable=True),
        sa.Column("approved_snapshot", sa.JSON(), nullable=True),
        sa.Column("approval_user_id", sa.String(length=255), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["job_id"], ["backfill_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["account_id"], ["email_accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("job_id", "uidvalidity", "uid", name="uq_bulk_proposal_position"),
        sa.CheckConstraint(
            "status IN ('proposed','excluded','approved','applying','applied','skipped','failed','review')",
            name="ck_bulk_proposals_status",
        ),
    )
    op.create_index("ix_bulk_proposals_job_status", "bulk_proposals", ["job_id", "status"])
    op.create_index("ix_bulk_proposals_account", "bulk_proposals", ["account_id", "created_at"])

    op.create_table(
        "bulk_apply_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source_job_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("state", sa.String(length=16), nullable=False, server_default="paused"),
        sa.Column("batch_size", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("cursor_id", sa.Uuid(), nullable=True),
        sa.Column("approved", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("applied", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("review_required", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["source_job_id"], ["backfill_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["account_id"], ["email_accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_job_id", name="uq_bulk_apply_job_source"),
        sa.CheckConstraint(
            "state IN ('running','paused','completed','cancelled','failed')",
            name="ck_bulk_apply_jobs_state",
        ),
    )
    op.create_index("ix_bulk_apply_jobs_account", "bulk_apply_jobs", ["account_id", "created_at"])
    op.create_index("ix_bulk_apply_jobs_state", "bulk_apply_jobs", ["state", "updated_at"])


def downgrade() -> None:
    op.drop_index("ix_bulk_apply_jobs_state", table_name="bulk_apply_jobs")
    op.drop_index("ix_bulk_apply_jobs_account", table_name="bulk_apply_jobs")
    op.drop_table("bulk_apply_jobs")
    op.drop_index("ix_bulk_proposals_account", table_name="bulk_proposals")
    op.drop_index("ix_bulk_proposals_job_status", table_name="bulk_proposals")
    op.drop_table("bulk_proposals")
    op.drop_constraint("ck_backfill_jobs_mode", "backfill_jobs", type_="check")
    op.drop_column("backfill_jobs", "mode")
