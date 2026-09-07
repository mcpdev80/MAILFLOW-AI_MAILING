"""Move LLM providers to the instance control plane and add model catalog access.

Revision ID: 029
Revises: 028
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("llm_providers", "org_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)

    op.create_table(
        "llm_models",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("model_id", sa.String(length=200), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["provider_id"], ["llm_providers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider_id", "model_id", name="uq_llm_models_provider_model"),
    )
    op.create_index("ix_llm_models_provider", "llm_models", ["provider_id"])

    op.create_table(
        "llm_org_model_access",
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("model_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["model_id"], ["llm_models.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("org_id", "model_id"),
    )
    op.create_index("ix_llm_org_model_access_model", "llm_org_model_access", ["model_id"])

    # Existing provider profiles become instance-managed. Preserve their previous
    # tenant availability by seeding catalog entries and grants for each original org.
    op.execute(
        """
        INSERT INTO llm_models (id, provider_id, model_id)
        SELECT gen_random_uuid(), p.id, model_id
        FROM llm_providers p
        CROSS JOIN LATERAL (
          SELECT DISTINCT model_id
          FROM unnest(ARRAY[
            p.default_classification_model,
            p.default_generation_model,
            p.fast_classification_model,
            p.deep_classification_model,
            p.generation_model
          ]) AS model_id
          WHERE model_id IS NOT NULL AND model_id <> ''
        ) models
        ON CONFLICT (provider_id, model_id) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO llm_org_model_access (org_id, model_id)
        SELECT p.org_id, m.id
        FROM llm_providers p
        JOIN llm_models m ON m.provider_id = p.id
        WHERE p.org_id IS NOT NULL
        ON CONFLICT DO NOTHING
        """
    )
    op.execute("UPDATE llm_providers SET org_id = NULL")


def downgrade() -> None:
    # Instance-wide providers cannot be losslessly mapped back to a single org.
    # Refuse an unsafe downgrade if any provider no longer has exactly one grant owner.
    op.execute(
        """
        UPDATE llm_providers p
        SET org_id = x.org_id
        FROM (
          SELECT m.provider_id, min(a.org_id)::uuid AS org_id
          FROM llm_models m
          JOIN llm_org_model_access a ON a.model_id = m.id
          GROUP BY m.provider_id
          HAVING count(DISTINCT a.org_id) = 1
        ) x
        WHERE x.provider_id = p.id
        """
    )
    op.drop_index("ix_llm_org_model_access_model", table_name="llm_org_model_access")
    op.drop_table("llm_org_model_access")
    op.drop_index("ix_llm_models_provider", table_name="llm_models")
    op.drop_table("llm_models")
    op.alter_column("llm_providers", "org_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)
