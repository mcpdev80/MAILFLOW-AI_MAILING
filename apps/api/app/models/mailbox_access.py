"""Explicit per-user access to shared mailboxes."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk


class MailboxAccess(Base):
    __tablename__ = "mailbox_access"
    __table_args__ = (
        UniqueConstraint(
            "account_id", "user_id", name="uq_mailbox_access_account_user"
        ),
    )

    id: Mapped[UUID] = uuid_pk()
    account_id: Mapped[UUID] = mapped_column(
        ForeignKey("email_accounts.id", ondelete="CASCADE"), index=True
    )
    # Stable Better Auth user id. Deliberately no FK because Better Auth owns
    # the user/member tables even though both applications share PostgreSQL.
    user_id: Mapped[str] = mapped_column(String(255), index=True)
    # Reading/using mailbox data and changing sharing are separate capabilities.
    # A shared-mailbox creator may manage access without automatically seeing mail.
    can_use: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )
    can_manage: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
