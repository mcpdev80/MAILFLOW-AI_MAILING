"""Add per-user notification preferences and events.

Revision ID: 022
Revises: 021
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notification_preferences",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_key", sa.String(length=255), nullable=False),
        sa.Column("urgent_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("security_review_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("jobs_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("mailbox_health_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("daily_summary_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("daily_summary_hour", sa.Integer(), nullable=False, server_default="8"),
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="UTC"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_id", "user_key", name="uq_notification_preferences_actor"),
        sa.CheckConstraint("daily_summary_hour >= 0 AND daily_summary_hour <= 23", name="ck_notification_preferences_hour"),
    )

    op.create_table(
        "notification_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_key", sa.String(length=255), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_email_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default="info"),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("body", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("dedupe_key", sa.String(length=500), nullable=False),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["account_id"], ["email_accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_email_id"], ["processed_emails.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_id", "user_key", "dedupe_key", name="uq_notification_event_dedupe"),
    )
    op.create_index("ix_notification_event_actor_read", "notification_events", ["org_id", "user_key", "read_at"])
    op.create_index("ix_notification_event_actor_created", "notification_events", ["org_id", "user_key", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_notification_event_actor_created", table_name="notification_events")
    op.drop_index("ix_notification_event_actor_read", table_name="notification_events")
    op.drop_table("notification_events")
    op.drop_table("notification_preferences")
