"""Add organization LLM role assignments.

Revision ID: 028
Revises: 027
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "028"
down_revision = "027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "llm_role_assignments",
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("provider_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("model_id", sa.String(length=200), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["provider_id"], ["llm_providers.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("org_id", "role"),
        sa.CheckConstraint(
            "role IN ('fast', 'deep', 'generation')",
            name="ck_llm_role_assignments_role",
        ),
    )
    op.create_index(
        "ix_llm_role_assignments_provider", "llm_role_assignments", ["provider_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_llm_role_assignments_provider", table_name="llm_role_assignments")
    op.drop_table("llm_role_assignments")
