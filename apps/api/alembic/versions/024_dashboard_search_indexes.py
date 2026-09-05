"""Add authorization-friendly dashboard and search indexes.

Revision ID: 024
Revises: 023
"""

from alembic import op

revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_processed_email_account_processed_at",
        "processed_emails",
        ["account_id", "processed_at"],
    )
    op.create_index(
        "ix_processed_email_account_importance",
        "processed_emails",
        ["account_id", "importance"],
    )
    op.create_index(
        "ix_processed_email_account_urgency",
        "processed_emails",
        ["account_id", "urgency"],
    )
    op.create_index(
        "ix_processed_email_account_action_required",
        "processed_emails",
        ["account_id", "action_required"],
    )
    op.create_index(
        "ix_processed_email_account_action_status",
        "processed_emails",
        ["account_id", "mailbox_action_status"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_processed_email_account_action_status", table_name="processed_emails"
    )
    op.drop_index(
        "ix_processed_email_account_action_required", table_name="processed_emails"
    )
    op.drop_index("ix_processed_email_account_urgency", table_name="processed_emails")
    op.drop_index(
        "ix_processed_email_account_importance", table_name="processed_emails"
    )
    op.drop_index(
        "ix_processed_email_account_processed_at", table_name="processed_emails"
    )
