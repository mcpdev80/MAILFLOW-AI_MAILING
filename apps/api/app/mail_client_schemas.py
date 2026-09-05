"""HTTP schemas for the provider-neutral mail client."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class MailAttachment(BaseModel):
    part_id: str
    filename: str
    mime_type: str
    size: int | None = None


class MailboxCapabilities(BaseModel):
    read_state: bool
    flag: bool
    move: bool
    archive: bool
    trash: bool
    spam: bool
    restore: bool
    tags: bool
    attachments: bool


class MailboxFolderView(BaseModel):
    name: str
    role: str | None = None
    selectable: bool


class MailboxCounter(BaseModel):
    account_id: UUID
    account_address: str
    folder: str
    total: int
    unread: int


class InboxMessage(BaseModel):
    account_id: UUID
    account_address: str
    ownership_mode: str
    uid: int
    folder: str
    message_id: str
    thread_id: str | None = None
    subject: str
    from_email: str
    to_emails: list[str]
    cc_emails: list[str] = Field(default_factory=list)
    date: str | None = None
    seen: bool
    flagged: bool
    answered: bool
    keywords: list[str] = Field(default_factory=list)
    attachments: list[MailAttachment] = Field(default_factory=list)


class UnifiedInbox(BaseModel):
    messages: list[InboxMessage]
    counters: list[MailboxCounter] = Field(default_factory=list)
    total_unread: int = 0
    next_before_uid_by_account: dict[str, int] = Field(default_factory=dict)


class MessageDetail(InboxMessage):
    body_text: str
    safe_html: str | None = None
    in_reply_to: str | None = None
    references: list[str] = Field(default_factory=list)


class ThreadView(BaseModel):
    account_id: UUID
    thread_id: str
    messages: list[MessageDetail]


MailActionName = Literal[
    "mark_read",
    "mark_unread",
    "flag",
    "unflag",
    "move",
    "archive",
    "trash",
    "spam",
    "restore",
    "add_tags",
    "remove_tags",
]


class MailActionRequest(BaseModel):
    action: MailActionName
    destination_folder: str | None = Field(default=None, max_length=500)
    tags: list[str] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def validate_arguments(self) -> "MailActionRequest":
        if self.action in {"move", "restore"} and not (self.destination_folder or "").strip():
            raise ValueError("destination_folder is required for move/restore")
        if self.action in {"add_tags", "remove_tags"} and not self.tags:
            raise ValueError("tags are required for tag actions")
        return self


class MailActionResult(BaseModel):
    action: MailActionName
    applied: bool
    destination_folder: str | None = None
