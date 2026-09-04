"""mailbox lifecycle retention events

Revision ID: 008
Revises: 007
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lifecycle_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("account_id", sa.UUID(), nullable=True),
        sa.Column("actor_user_id", sa.String(length=255), nullable=True),
        sa.Column("event", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_lifecycle_events_org_created",
        "lifecycle_events",
        ["org_id", "created_at"],
    )
    op.create_index(
        "ix_lifecycle_events_account",
        "lifecycle_events",
        ["account_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_lifecycle_events_account", table_name="lifecycle_events")
    op.drop_index("ix_lifecycle_events_org_created", table_name="lifecycle_events")
    op.drop_table("lifecycle_events")
