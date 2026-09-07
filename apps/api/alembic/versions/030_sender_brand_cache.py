"""Add cached sender-domain brand assets.

Revision ID: 030
Revises: 029
"""

from alembic import op
import sqlalchemy as sa

revision = "030"
down_revision = "029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sender_brand_cache",
        sa.Column("domain", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="missing", nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=True),
        sa.Column("source_url", sa.String(length=1000), nullable=True),
        sa.Column("content_type", sa.String(length=100), nullable=True),
        sa.Column("image_data", sa.LargeBinary(), nullable=True),
        sa.Column(
            "checked_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("domain"),
    )


def downgrade() -> None:
    op.drop_table("sender_brand_cache")
