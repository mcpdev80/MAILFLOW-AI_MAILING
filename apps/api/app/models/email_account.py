"""EmailAccount model — mailbox managed by MailFlow."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, uuid_pk
from app.models.llm_provider import LLMProvider


class EmailAccount(Base):
    __tablename__ = "email_accounts"
    __table_args__ = (
        CheckConstraint(
            "(ownership_mode = 'private' AND owner_user_id IS NOT NULL) OR "
            "(ownership_mode IN ('shared', 'unresolved') AND owner_user_id IS NULL)",
            name="ck_email_accounts_ownership",
        ),
    )

    id: Mapped[UUID] = uuid_pk()
    org_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE")
    )
    # Stable Better Auth user id for private mailboxes. Deliberately no FK: the
    # Better Auth tables are managed by the web app, although they share the DB.
    owner_user_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # ``unresolved`` is migration-only and fails closed in multi-user mode.
    ownership_mode: Mapped[str] = mapped_column(
        String(20), default="unresolved", server_default="unresolved"
    )
    provider_type: Mapped[str] = mapped_column(String(20), default="imap")
    imap_host: Mapped[str] = mapped_column(String(255))
    imap_port: Mapped[int] = mapped_column(Integer, default=993)
    use_ssl: Mapped[bool] = mapped_column(Boolean, default=True)
    username: Mapped[str] = mapped_column(String(255))
    # Encrypted IMAP password for password-based accounts. Null for OAuth.
    encrypted_credentials: Mapped[str | None] = mapped_column(String, nullable=True)
    # Encrypted OAuth refresh token for Gmail/Microsoft accounts.
    encrypted_oauth: Mapped[str | None] = mapped_column(String, nullable=True)
    inbox_folder: Mapped[str] = mapped_column(String(255), default="INBOX")
    unclassified_folder: Mapped[str] = mapped_column(
        String(255), default="Sin_Clasificar"
    )
    drafts_folder: Mapped[str] = mapped_column(String(255), default="Drafts")
    interval_minutes: Mapped[int] = mapped_column(Integer, default=5)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_cycle_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    llm_provider_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("llm_providers.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Never auto-loaded; AccountRepository.get_full_config opts in explicitly.
    llm_provider: Mapped[LLMProvider | None] = relationship(
        "LLMProvider",
        foreign_keys=[llm_provider_id],
        lazy="noload",
    )
