"""HTTP schemas for the provider-neutral mail client."""

from __future__ import annotations

from email.header import decode_header, make_header
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


def decode_mime_header(value: str | None) -> str:
    """Decode RFC 2047 encoded words while preserving already-decoded headers."""
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except (LookupError, UnicodeError, ValueError):
        return value


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
    category: str | None = None
    subcategory: str | None = None
    importance: str | None = None
    urgency: str | None = None
    action_required: str | None = None
    review_required: bool = False
    system_tags: list[str] = Field(default_factory=list)
    user_tags: list[str] = Field(default_factory=list)

    @field_validator("subject", "from_email", mode="before")
    @classmethod
    def decode_display_header(cls, value: object) -> object:
        return decode_mime_header(value) if isinstance(value, str) else value

    @field_validator("to_emails", "cc_emails", mode="before")
    @classmethod
    def decode_address_headers(cls, value: object) -> object:
        if not isinstance(value, (list, tuple)):
            return value
        return [decode_mime_header(item) if isinstance(item, str) else item for item in value]


class UnifiedInbox(BaseModel):
    messages: list[InboxMessage]
    counters: list[MailboxCounter] = Field(default_factory=list)
    total_unread: int = 0
    next_before_uid_by_account: dict[str, int] = Field(default_factory=dict)


class MessageDetail(InboxMessage):
    body_text: str
    safe_html: str | None = None
    rich_html: str | None = None
    has_html: bool = False
    remote_content_trusted: bool = False
    in_reply_to: str | None = None
    references: list[str] = Field(default_factory=list)


class RemoteContentPreference(BaseModel):
    sender_email: str = Field(min_length=3, max_length=320)
    allowed: bool


class ThreadInsights(BaseModel):
    overview: str
    key_points: list[str] = Field(default_factory=list)
    todos: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    open_action_required: bool = False
    deadline: str | None = None


class ThreadView(BaseModel):
    account_id: UUID
    thread_id: str
    messages: list[MessageDetail]
    insights: ThreadInsights | None = None


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
        if (
            self.action in {"move", "restore"}
            and not (self.destination_folder or "").strip()
        ):
            raise ValueError("destination_folder is required for move/restore")
        if self.action in {"add_tags", "remove_tags"} and not self.tags:
            raise ValueError("tags are required for tag actions")
        return self


class MailActionResult(BaseModel):
    action: MailActionName
    applied: bool
    destination_folder: str | None = None


class MoveUndoRequest(BaseModel):
    """Undo a move using stable Message-ID rather than the pre-move IMAP UID."""

    message_id: str = Field(min_length=1, max_length=1000)
    current_folder: str = Field(min_length=1, max_length=500)
    original_folder: str = Field(min_length=1, max_length=500)
