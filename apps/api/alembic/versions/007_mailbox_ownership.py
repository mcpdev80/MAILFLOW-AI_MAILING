"""private/shared mailbox ownership and selective access

Revision ID: 007
Revises: 006

Existing rows enter the fail-closed ``unresolved`` state. They are deliberately
not treated as shared in multi-user mode until ownership is migrated explicitly.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "email_accounts",
        sa.Column("owner_user_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "email_accounts",
        sa.Column(
            "ownership_mode",
            sa.String(length=20),
            nullable=False,
            server_default="unresolved",
        ),
    )
    op.create_check_constraint(
        "ck_email_accounts_ownership",
        "email_accounts",
        "(ownership_mode = 'private' AND owner_user_id IS NOT NULL) OR "
        "(ownership_mode IN ('shared', 'unresolved') AND owner_user_id IS NULL)",
    )
    op.create_index(
        "ix_email_accounts_ownership",
        "email_accounts",
        ["org_id", "ownership_mode", "owner_user_id"],
    )

    op.create_table(
        "mailbox_access",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("account_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("can_use", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("can_manage", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(
            ["account_id"], ["email_accounts.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "account_id", "user_id", name="uq_mailbox_access_account_user"
        ),
    )
    op.create_index(
        "ix_mailbox_access_account_id", "mailbox_access", ["account_id"]
    )
    op.create_index("ix_mailbox_access_user_id", "mailbox_access", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_mailbox_access_user_id", table_name="mailbox_access")
    op.drop_index("ix_mailbox_access_account_id", table_name="mailbox_access")
    op.drop_table("mailbox_access")
    op.drop_index("ix_email_accounts_ownership", table_name="email_accounts")
    op.drop_constraint(
        "ck_email_accounts_ownership",
        "email_accounts",
        type_="check",
    )
    op.drop_column("email_accounts", "ownership_mode")
    op.drop_column("email_accounts", "owner_user_id")
