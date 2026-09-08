"""Instance-scoped LLM provider configuration."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk


class LLMProvider(Base):
    __tablename__ = "llm_providers"

    id: Mapped[UUID] = uuid_pk()
    # Kept nullable for rolling compatibility with pre-029 databases and old
    # backups. New providers are instance-scoped and therefore use NULL here.
    org_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True
    )
    label: Mapped[str] = mapped_column(String(100))
    type: Mapped[str] = mapped_column(String(50))

    # Provider endpoint and credential are instance-control-plane secrets.
    base_url: Mapped[str] = mapped_column(String(500))
    encrypted_api_key: Mapped[str | None] = mapped_column(String, nullable=True)

    # Compatibility defaults retained for existing runtime paths.
    default_classification_model: Mapped[str] = mapped_column(String(200))
    default_generation_model: Mapped[str] = mapped_column(String(200))

    fast_classification_model: Mapped[str | None] = mapped_column(
        String(200), nullable=True
    )
    deep_classification_model: Mapped[str | None] = mapped_column(
        String(200), nullable=True
    )
    generation_model: Mapped[str | None] = mapped_column(String(200), nullable=True)

    fast_classification_base_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    deep_classification_base_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    generation_base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    encrypted_fast_api_key: Mapped[str | None] = mapped_column(String, nullable=True)
    encrypted_deep_api_key: Mapped[str | None] = mapped_column(String, nullable=True)
    encrypted_generation_api_key: Mapped[str | None] = mapped_column(
        String, nullable=True
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
