"""extended semantic classification result

Revision ID: 009
Revises: 008
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "processed_emails",
        sa.Column("classification_label", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "processed_emails",
        sa.Column("category", sa.String(length=64), nullable=False, server_default="other"),
    )
    op.add_column(
        "processed_emails",
        sa.Column("subcategory", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "processed_emails",
        sa.Column("suggested_category", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "processed_emails",
        sa.Column("suggested_subcategory", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "processed_emails",
        sa.Column("importance", sa.String(length=32), nullable=False, server_default="unknown"),
    )
    op.add_column(
        "processed_emails",
        sa.Column("urgency", sa.String(length=32), nullable=False, server_default="unknown"),
    )
    op.add_column(
        "processed_emails",
        sa.Column("action_required", sa.String(length=16), nullable=False, server_default="unknown"),
    )
    op.add_column(
        "processed_emails",
        sa.Column("system_tags", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "processed_emails",
        sa.Column("user_tags", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "processed_emails",
        sa.Column("needs_more_context", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "processed_emails",
        sa.Column("review_required", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "processed_emails",
        sa.Column("reason", sa.String(length=300), nullable=True),
    )

    # Existing rows predate semantic classification. Preserve their applied folder
    # routing as a compatibility label, but do not pretend it is a confirmed category.
    op.execute(
        "UPDATE processed_emails "
        "SET classification_label = destination_folder "
        "WHERE classification_label IS NULL"
    )

    op.create_index(
        "ix_processed_email_category",
        "processed_emails",
        ["account_id", "category"],
    )
    op.create_index(
        "ix_processed_email_review",
        "processed_emails",
        ["account_id", "review_required"],
    )


def downgrade() -> None:
    op.drop_index("ix_processed_email_review", table_name="processed_emails")
    op.drop_index("ix_processed_email_category", table_name="processed_emails")
    op.drop_column("processed_emails", "reason")
    op.drop_column("processed_emails", "review_required")
    op.drop_column("processed_emails", "needs_more_context")
    op.drop_column("processed_emails", "user_tags")
    op.drop_column("processed_emails", "system_tags")
    op.drop_column("processed_emails", "action_required")
    op.drop_column("processed_emails", "urgency")
    op.drop_column("processed_emails", "importance")
    op.drop_column("processed_emails", "suggested_subcategory")
    op.drop_column("processed_emails", "suggested_category")
    op.drop_column("processed_emails", "subcategory")
    op.drop_column("processed_emails", "category")
    op.drop_column("processed_emails", "classification_label")
