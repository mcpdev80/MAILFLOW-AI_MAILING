"""Add global attachment library tables.

Revision ID: 025
Revises: 024
"""

import sqlalchemy as sa
from alembic import op

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "attachment_folders",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("owner_user_id", sa.String(length=255), nullable=True),
        sa.Column("parent_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("managed_by", sa.String(length=16), server_default="ai", nullable=False),
        sa.Column("pinned", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("managed_by IN ('ai', 'user')", name="ck_attachment_folders_managed_by"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["attachment_folders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_id", "owner_user_id", "parent_id", "name", name="uq_attachment_folder_sibling_name"),
    )
    op.create_index("ix_attachment_folders_owner", "attachment_folders", ["org_id", "owner_user_id"])

    op.create_table(
        "attachment_documents",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("canonical_filename", sa.String(length=500), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("analysis_status", sa.String(length=16), server_default="pending", nullable=False),
        sa.Column("document_type", sa.String(length=100), nullable=True),
        sa.Column("ai_category", sa.String(length=100), nullable=True),
        sa.Column("ai_subcategory", sa.String(length=150), nullable=True),
        sa.Column("ai_confidence", sa.Float(), nullable=True),
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column("tags", sa.JSON(), server_default="[]", nullable=False),
        sa.Column("user_folder_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("analysis_status IN ('pending', 'ready', 'failed')", name="ck_attachment_documents_analysis_status"),
        sa.CheckConstraint("ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)", name="ck_attachment_documents_ai_confidence"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_folder_id"], ["attachment_folders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_id", "content_sha256", name="uq_attachment_document_org_hash"),
    )
    op.create_index("ix_attachment_documents_org_created", "attachment_documents", ["org_id", "created_at"])
    op.create_index("ix_attachment_documents_org_category", "attachment_documents", ["org_id", "ai_category"])
    op.create_index("ix_attachment_documents_folder", "attachment_documents", ["user_folder_id"])

    op.create_table(
        "attachment_sources",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("document_id", sa.UUID(), nullable=True),
        sa.Column("account_id", sa.UUID(), nullable=False),
        sa.Column("uid", sa.Integer(), nullable=False),
        sa.Column("folder", sa.String(length=500), nullable=False),
        sa.Column("part_id", sa.String(length=255), nullable=False),
        sa.Column("message_id", sa.String(length=500), nullable=True),
        sa.Column("thread_id", sa.String(length=500), nullable=True),
        sa.Column("from_email", sa.String(length=500), nullable=False),
        sa.Column("subject", sa.Text(), server_default="", nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_filename", sa.String(length=500), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("disposition", sa.String(length=100), nullable=True),
        sa.Column("ingestion_status", sa.String(length=20), nullable=False),
        sa.Column("safety_reason", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("ingestion_status IN ('stored', 'ignored', 'blocked', 'unsupported', 'failed')", name="ck_attachment_sources_ingestion_status"),
        sa.ForeignKeyConstraint(["account_id"], ["email_accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["attachment_documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("account_id", "folder", "uid", "part_id", name="uq_attachment_source_location"),
    )
    op.create_index("ix_attachment_sources_document", "attachment_sources", ["document_id"])
    op.create_index("ix_attachment_sources_account", "attachment_sources", ["account_id", "created_at"])
    op.create_index("ix_attachment_sources_status", "attachment_sources", ["ingestion_status"])

    op.create_table(
        "attachment_memory",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("owner_user_id", sa.String(length=255), nullable=True),
        sa.Column("folder_id", sa.UUID(), nullable=False),
        sa.Column("sender_email", sa.String(length=500), nullable=True),
        sa.Column("sender_domain", sa.String(length=255), nullable=True),
        sa.Column("filename_pattern", sa.String(length=500), nullable=True),
        sa.Column("mime_type", sa.String(length=255), nullable=True),
        sa.Column("document_type", sa.String(length=100), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("usage_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["folder_id"], ["attachment_folders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_attachment_memory_owner", "attachment_memory", ["org_id", "owner_user_id", "active"])


def downgrade() -> None:
    op.drop_index("ix_attachment_memory_owner", table_name="attachment_memory")
    op.drop_table("attachment_memory")
    op.drop_index("ix_attachment_sources_status", table_name="attachment_sources")
    op.drop_index("ix_attachment_sources_account", table_name="attachment_sources")
    op.drop_index("ix_attachment_sources_document", table_name="attachment_sources")
    op.drop_table("attachment_sources")
    op.drop_index("ix_attachment_documents_folder", table_name="attachment_documents")
    op.drop_index("ix_attachment_documents_org_category", table_name="attachment_documents")
    op.drop_index("ix_attachment_documents_org_created", table_name="attachment_documents")
    op.drop_table("attachment_documents")
    op.drop_index("ix_attachment_folders_owner", table_name="attachment_folders")
    op.drop_table("attachment_folders")
