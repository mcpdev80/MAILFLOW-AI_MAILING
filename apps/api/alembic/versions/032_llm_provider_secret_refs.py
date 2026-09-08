"""Add optional external secret references for LLM provider credentials.

Revision ID: 032
Revises: 031
"""

from alembic import op
import sqlalchemy as sa

revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None


_COLUMNS = (
    "api_key_secret_ref",
    "fast_api_key_secret_ref",
    "deep_api_key_secret_ref",
    "generation_api_key_secret_ref",
)


def upgrade() -> None:
    for column in _COLUMNS:
        op.add_column(
            "llm_providers",
            sa.Column(column, sa.String(length=500), nullable=True),
        )


def downgrade() -> None:
    for column in reversed(_COLUMNS):
        op.drop_column("llm_providers", column)
