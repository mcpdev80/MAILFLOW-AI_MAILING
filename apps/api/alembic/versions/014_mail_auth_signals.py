"""persist normalized mail authentication and spam signals

Revision ID: 014
Revises: 013
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name, length in (
        ("auth_spf", 16),
        ("auth_dkim", 16),
        ("auth_dmarc", 20),
        ("auth_arc", 16),
        ("spam_verdict", 16),
    ):
        op.add_column(
            "processed_emails",
            sa.Column(
                name,
                sa.String(length=length),
                nullable=False,
                server_default="unknown",
            ),
        )
        op.alter_column("processed_emails", name, server_default=None)
    op.add_column(
        "processed_emails",
        sa.Column("spam_score", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("processed_emails", "spam_score")
    op.drop_column("processed_emails", "spam_verdict")
    op.drop_column("processed_emails", "auth_arc")
    op.drop_column("processed_emails", "auth_dmarc")
    op.drop_column("processed_emails", "auth_dkim")
    op.drop_column("processed_emails", "auth_spf")
