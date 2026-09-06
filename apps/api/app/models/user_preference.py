"""Per-user application preferences shared across product surfaces."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk


class UserPreference(Base):
    __tablename__ = "user_preferences"
    __table_args__ = (
        UniqueConstraint("org_id", "user_key", name="uq_user_preferences_actor"),
    )

    id: Mapped[UUID] = uuid_pk()
    org_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE")
    )
    user_key: Mapped[str] = mapped_column(String(255))
    locale: Mapped[str] = mapped_column(String(8), default="en", server_default="en")
    theme: Mapped[str] = mapped_column(
        String(16), default="system", server_default="system"
    )
    density: Mapped[str] = mapped_column(
        String(16), default="comfortable", server_default="comfortable"
    )
    workspace_layout: Mapped[str] = mapped_column(
        String(16), default="classic", server_default="classic"
    )
    side_panel_alignment: Mapped[str] = mapped_column(
        String(16), default="left", server_default="left"
    )
    workspace_custom_config: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
