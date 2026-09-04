"""add mailbox action policy and action decision fields

Revision ID: 016
Revises: 015
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "email_accounts",
        sa.Column(
            "move_policy",
            sa.String(length=16),
            nullable=False,
            server_default="automatic",
        ),
    )
    op.add_column(
        "email_accounts",
        sa.Column(
            "archive_policy",
            sa.String(length=16),
            nullable=False,
            server_default="off",
        ),
    )
    op.add_column(
        "email_accounts",
        sa.Column(
            "action_confidence_threshold",
            sa.Float(),
            nullable=False,
            server_default="0.85",
        ),
    )
    op.create_check_constraint(
        "ck_email_accounts_move_policy",
        "email_accounts",
        "move_policy IN ('off', 'review', 'automatic')",
    )
    op.create_check_constraint(
        "ck_email_accounts_archive_policy",
        "email_accounts",
        "archive_policy IN ('off', 'review', 'automatic')",
    )
    op.create_check_constraint(
        "ck_email_accounts_action_confidence",
        "email_accounts",
        "action_confidence_threshold >= 0 AND action_confidence_threshold <= 1",
    )

    op.add_column(
        "processed_emails",
        sa.Column(
            "mailbox_action",
            sa.String(length=16),
            nullable=False,
            server_default="move",
        ),
    )
    op.add_column(
        "processed_emails",
        sa.Column(
            "mailbox_action_status",
            sa.String(length=16),
            nullable=False,
            server_default="execute",
        ),
    )
    op.add_column(
        "processed_emails",
        sa.Column("mailbox_action_reason", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "processed_emails",
        sa.Column(
            "action_review_required",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )

    # Defaults remain on account policy columns for ORM-free account creation and
    # safe upgrades. Historical processed rows keep their backfilled action state.


def downgrade() -> None:
    op.drop_column("processed_emails", "action_review_required")
    op.drop_column("processed_emails", "mailbox_action_reason")
    op.drop_column("processed_emails", "mailbox_action_status")
    op.drop_column("processed_emails", "mailbox_action")

    op.drop_constraint(
        "ck_email_accounts_action_confidence", "email_accounts", type_="check"
    )
    op.drop_constraint(
        "ck_email_accounts_archive_policy", "email_accounts", type_="check"
    )
    op.drop_constraint(
        "ck_email_accounts_move_policy", "email_accounts", type_="check"
    )
    op.drop_column("email_accounts", "action_confidence_threshold")
    op.drop_column("email_accounts", "archive_policy")
    op.drop_column("email_accounts", "move_policy")
