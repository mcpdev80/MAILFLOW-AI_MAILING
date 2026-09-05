"""Add outbound drafts and SMTP account settings.

Revision ID: 021
Revises: 020
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("email_accounts", sa.Column("smtp_host", sa.String(length=255), nullable=True))
    op.add_column("email_accounts", sa.Column("smtp_port", sa.Integer(), nullable=True))
    op.add_column(
        "email_accounts",
        sa.Column("smtp_security", sa.String(length=16), nullable=False, server_default="starttls"),
    )
    op.add_column(
        "email_accounts",
        sa.Column("smtp_username", sa.String(length=255), nullable=True),
    )
    op.create_check_constraint(
        "ck_email_accounts_smtp_security",
        "email_accounts",
        "smtp_security IN ('ssl', 'starttls', 'plain')",
    )

    op.create_table(
        "outbound_drafts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_user_id", sa.String(length=255), nullable=True),
        sa.Column("message_type", sa.String(length=16), nullable=False, server_default="new"),
        sa.Column("in_reply_to", sa.String(length=998), nullable=True),
        sa.Column("references", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("to_recipients", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("cc_recipients", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("bcc_recipients", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("subject", sa.String(length=998), nullable=False, server_default=""),
        sa.Column("body_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("body_html", sa.Text(), nullable=True),
        sa.Column("editor_mode", sa.String(length=16), nullable=False, server_default="rich_text"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="draft"),
        sa.Column("send_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sent_message_id", sa.String(length=998), nullable=True),
        sa.Column("last_error", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["account_id"], ["email_accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("message_type IN ('new', 'reply', 'reply_all', 'forward')", name="ck_outbound_drafts_message_type"),
        sa.CheckConstraint("editor_mode IN ('rich_text', 'markdown')", name="ck_outbound_drafts_editor_mode"),
        sa.CheckConstraint("status IN ('draft', 'sending', 'sent', 'failed', 'discarded')", name="ck_outbound_drafts_status"),
    )
    op.create_index("ix_outbound_drafts_account_status", "outbound_drafts", ["account_id", "status"])
    op.create_index("ix_outbound_drafts_owner_updated", "outbound_drafts", ["owner_user_id", "updated_at"])

    op.create_table(
        "outbound_draft_attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("draft_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["draft_id"], ["outbound_drafts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_outbound_draft_attachments_draft", "outbound_draft_attachments", ["draft_id"])


def downgrade() -> None:
    op.drop_index("ix_outbound_draft_attachments_draft", table_name="outbound_draft_attachments")
    op.drop_table("outbound_draft_attachments")
    op.drop_index("ix_outbound_drafts_owner_updated", table_name="outbound_drafts")
    op.drop_index("ix_outbound_drafts_account_status", table_name="outbound_drafts")
    op.drop_table("outbound_drafts")
    op.drop_constraint("ck_email_accounts_smtp_security", "email_accounts", type_="check")
    op.drop_column("email_accounts", "smtp_username")
    op.drop_column("email_accounts", "smtp_security")
    op.drop_column("email_accounts", "smtp_port")
    op.drop_column("email_accounts", "smtp_host")
