"""fast and deep classification model roles

Revision ID: 012
Revises: 011
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "llm_providers",
        sa.Column("fast_classification_model", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "llm_providers",
        sa.Column("deep_classification_model", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "llm_providers",
        sa.Column("generation_model", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "llm_providers",
        sa.Column("fast_classification_base_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "llm_providers",
        sa.Column("deep_classification_base_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "llm_providers",
        sa.Column("generation_base_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "llm_providers",
        sa.Column("encrypted_fast_api_key", sa.String(), nullable=True),
    )
    op.add_column(
        "llm_providers",
        sa.Column("encrypted_deep_api_key", sa.String(), nullable=True),
    )
    op.add_column(
        "llm_providers",
        sa.Column("encrypted_generation_api_key", sa.String(), nullable=True),
    )
    op.add_column(
        "processed_emails",
        sa.Column("classification_model", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("processed_emails", "classification_model")
    op.drop_column("llm_providers", "encrypted_generation_api_key")
    op.drop_column("llm_providers", "encrypted_deep_api_key")
    op.drop_column("llm_providers", "encrypted_fast_api_key")
    op.drop_column("llm_providers", "generation_base_url")
    op.drop_column("llm_providers", "deep_classification_base_url")
    op.drop_column("llm_providers", "fast_classification_base_url")
    op.drop_column("llm_providers", "generation_model")
    op.drop_column("llm_providers", "deep_classification_model")
    op.drop_column("llm_providers", "fast_classification_model")
