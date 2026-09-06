"""Add workspace appearance preferences.

Revision ID: 025
Revises: 024
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("theme", sa.String(length=16), nullable=False, server_default="system"),
    )
    op.add_column(
        "user_preferences",
        sa.Column("density", sa.String(length=16), nullable=False, server_default="comfortable"),
    )
    op.add_column(
        "user_preferences",
        sa.Column("workspace_layout", sa.String(length=16), nullable=False, server_default="classic"),
    )
    op.add_column(
        "user_preferences",
        sa.Column("side_panel_alignment", sa.String(length=16), nullable=False, server_default="left"),
    )
    op.add_column(
        "user_preferences",
        sa.Column("workspace_custom_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.create_check_constraint(
        "ck_user_preferences_theme",
        "user_preferences",
        "theme IN ('light', 'dark', 'system')",
    )
    op.create_check_constraint(
        "ck_user_preferences_density",
        "user_preferences",
        "density IN ('comfortable', 'compact')",
    )
    op.create_check_constraint(
        "ck_user_preferences_workspace_layout",
        "user_preferences",
        "workspace_layout IN ('classic', 'vertical', 'focus', 'compact', 'wide', 'custom')",
    )
    op.create_check_constraint(
        "ck_user_preferences_side_panel_alignment",
        "user_preferences",
        "side_panel_alignment IN ('left', 'right')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_user_preferences_side_panel_alignment", "user_preferences", type_="check"
    )
    op.drop_constraint(
        "ck_user_preferences_workspace_layout", "user_preferences", type_="check"
    )
    op.drop_constraint("ck_user_preferences_density", "user_preferences", type_="check")
    op.drop_constraint("ck_user_preferences_theme", "user_preferences", type_="check")
    op.drop_column("user_preferences", "workspace_custom_config")
    op.drop_column("user_preferences", "side_panel_alignment")
    op.drop_column("user_preferences", "workspace_layout")
    op.drop_column("user_preferences", "density")
    op.drop_column("user_preferences", "theme")
