"""add trusted DecisionMemory entries and classification provenance

Revision ID: 015
Revises: 014
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "decision_memory_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("email_accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sender_email", sa.String(length=500), nullable=True),
        sa.Column("sender_domain", sa.String(length=255), nullable=True),
        sa.Column("subject_pattern", sa.String(length=500), nullable=True),
        sa.Column("thread_id", sa.String(length=500), nullable=True),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("subcategory", sa.String(length=255), nullable=True),
        sa.Column("importance", sa.String(length=32), nullable=False),
        sa.Column("urgency", sa.String(length=32), nullable=False),
        sa.Column("action_required", sa.String(length=16), nullable=False),
        sa.Column("system_tags", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("user_tags", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("routing_target", sa.String(length=255), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("trust_score", sa.Float(), nullable=False, server_default="1"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("hit_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_used", sa.DateTime(timezone=True), nullable=True),
        sa.Column("superseded_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["superseded_by_id"], ["decision_memory_entries.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_decision_memory_account_enabled",
        "decision_memory_entries",
        ["account_id", "enabled"],
    )
    op.create_index(
        "ix_decision_memory_sender",
        "decision_memory_entries",
        ["account_id", "sender_email"],
    )
    op.create_index(
        "ix_decision_memory_domain",
        "decision_memory_entries",
        ["account_id", "sender_domain"],
    )
    op.create_index(
        "ix_decision_memory_thread",
        "decision_memory_entries",
        ["account_id", "thread_id"],
    )

    op.add_column(
        "processed_emails",
        sa.Column("decision_memory_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "processed_emails",
        sa.Column("decision_memory_match_confidence", sa.Float(), nullable=True),
    )
    op.add_column(
        "processed_emails",
        sa.Column(
            "decision_memory_hint_used",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.alter_column(
        "processed_emails", "decision_memory_hint_used", server_default=None
    )


def downgrade() -> None:
    op.drop_column("processed_emails", "decision_memory_hint_used")
    op.drop_column("processed_emails", "decision_memory_match_confidence")
    op.drop_column("processed_emails", "decision_memory_id")
    op.drop_index("ix_decision_memory_thread", table_name="decision_memory_entries")
    op.drop_index("ix_decision_memory_domain", table_name="decision_memory_entries")
    op.drop_index("ix_decision_memory_sender", table_name="decision_memory_entries")
    op.drop_index(
        "ix_decision_memory_account_enabled", table_name="decision_memory_entries"
    )
    op.drop_table("decision_memory_entries")
