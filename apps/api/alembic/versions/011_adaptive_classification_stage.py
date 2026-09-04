"""persist adaptive classification stage

Revision ID: 011
Revises: 010
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "processed_emails",
        sa.Column("classification_stage", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("processed_emails", "classification_stage")
