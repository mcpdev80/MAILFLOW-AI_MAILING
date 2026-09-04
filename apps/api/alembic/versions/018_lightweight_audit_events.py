"""extend lifecycle events for lightweight action audit

Revision ID: 018
Revises: 017
"""

from alembic import op
import sqlalchemy as sa

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("lifecycle_events", sa.Column("message_ref", sa.String(length=255), nullable=True))
    op.add_column(
        "lifecycle_events",
        sa.Column("actor_type", sa.String(length=16), nullable=False, server_default="system"),
    )
    op.add_column(
        "lifecycle_events",
        sa.Column("status", sa.String(length=16), nullable=False, server_default="success"),
    )
    op.add_column(
        "lifecycle_events",
        sa.Column("details", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
    )
    op.create_index(
        "ix_lifecycle_events_type_created",
        "lifecycle_events",
        ["event", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_lifecycle_events_type_created", table_name="lifecycle_events")
    op.drop_column("lifecycle_events", "details")
    op.drop_column("lifecycle_events", "status")
    op.drop_column("lifecycle_events", "actor_type")
    op.drop_column("lifecycle_events", "message_ref")
