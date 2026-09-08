"""Cached sender-domain brand assets for the mail workspace."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, LargeBinary, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SenderBrandCache(Base):
    __tablename__ = "sender_brand_cache"

    domain: Mapped[str] = mapped_column(String(255), primary_key=True)
    status: Mapped[str] = mapped_column(String(16), default="missing", server_default="missing")
    source_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    image_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
