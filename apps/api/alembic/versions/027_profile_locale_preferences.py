"""Add profile locale preferences.

Revision ID: 027
Revises: 026
"""

from alembic import op
import sqlalchemy as sa

revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column(
            "timezone", sa.String(length=64), nullable=False, server_default="UTC"
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "date_format",
            sa.String(length=16),
            nullable=False,
            server_default="YYYY-MM-DD",
        ),
    )
    op.create_check_constraint(
        "ck_user_preferences_date_format",
        "user_preferences",
        "date_format IN ('DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_user_preferences_date_format", "user_preferences", type_="check"
    )
    op.drop_column("user_preferences", "date_format")
    op.drop_column("user_preferences", "timezone")
