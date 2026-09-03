"""private/shared mailbox ownership

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


def downgrade() -> None:
    op.drop_index("ix_email_accounts_ownership", table_name="email_accounts")
    op.drop_constraint(
        "ck_email_accounts_ownership",
        "email_accounts",
        type_="check",
    )
    op.drop_column("email_accounts", "ownership_mode")
    op.drop_column("email_accounts", "owner_user_id")
