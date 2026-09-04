"""thread-aware classification summaries

Revision ID: 010
Revises: 009
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "processed_emails",
        sa.Column("thread_id", sa.String(length=500), nullable=True),
    )
    op.create_index(
        "ix_processed_email_thread",
        "processed_emails",
        ["account_id", "thread_id"],
    )

    op.create_table(
        "thread_summaries",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("account_id", sa.UUID(), nullable=False),
        sa.Column("thread_id", sa.String(length=500), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("subject_key", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("last_message_id", sa.String(length=500), nullable=True),
        sa.Column(
            "last_updated",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("message_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("participants", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column(
            "open_action_required",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("deadline", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["email_accounts.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "account_id",
            "thread_id",
            name="uq_thread_summary_account_thread",
        ),
    )
    op.create_index(
        "ix_thread_summary_subject",
        "thread_summaries",
        ["account_id", "subject_key"],
    )
    op.create_index(
        "ix_thread_summary_last_message",
        "thread_summaries",
        ["account_id", "last_message_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_thread_summary_last_message", table_name="thread_summaries")
    op.drop_index("ix_thread_summary_subject", table_name="thread_summaries")
    op.drop_table("thread_summaries")
    op.drop_index("ix_processed_email_thread", table_name="processed_emails")
    op.drop_column("processed_emails", "thread_id")
