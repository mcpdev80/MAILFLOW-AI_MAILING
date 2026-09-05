"""HTTP DTOs for composing, saving and sending outbound mail."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

MessageType = Literal["new", "reply", "reply_all", "forward"]
EditorMode = Literal["rich_text", "markdown"]
DraftStatus = Literal["draft", "sending", "sent", "failed", "discarded"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _clean_recipients(values: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in values:
        value = raw.strip()
        if not value:
            continue
        key = value.casefold()
        if key not in seen:
            cleaned.append(value)
            seen.add(key)
    return cleaned


class DraftCreate(BaseModel):
    account_id: UUID
    message_type: MessageType = "new"
    in_reply_to: str | None = Field(default=None, max_length=998)
    references: list[str] = Field(default_factory=list, max_length=100)
    to_recipients: list[str] = Field(default_factory=list, max_length=200)
    cc_recipients: list[str] = Field(default_factory=list, max_length=200)
    bcc_recipients: list[str] = Field(default_factory=list, max_length=200)
    subject: str = Field(default="", max_length=998)
    body_text: str = Field(default="", max_length=2_000_000)
    body_html: str | None = Field(default=None, max_length=4_000_000)
    editor_mode: EditorMode = "rich_text"

    @field_validator("to_recipients", "cc_recipients", "bcc_recipients")
    @classmethod
    def normalize_recipients(cls, values: list[str]) -> list[str]:
        return _clean_recipients(values)


class DraftUpdate(BaseModel):
    account_id: UUID | None = None
    message_type: MessageType | None = None
    in_reply_to: str | None = Field(default=None, max_length=998)
    references: list[str] | None = Field(default=None, max_length=100)
    to_recipients: list[str] | None = Field(default=None, max_length=200)
    cc_recipients: list[str] | None = Field(default=None, max_length=200)
    bcc_recipients: list[str] | None = Field(default=None, max_length=200)
    subject: str | None = Field(default=None, max_length=998)
    body_text: str | None = Field(default=None, max_length=2_000_000)
    body_html: str | None = Field(default=None, max_length=4_000_000)
    editor_mode: EditorMode | None = None

    @field_validator("to_recipients", "cc_recipients", "bcc_recipients")
    @classmethod
    def normalize_optional_recipients(cls, values: list[str] | None) -> list[str] | None:
        return None if values is None else _clean_recipients(values)


class AttachmentOut(ORMModel):
    id: UUID
    filename: str
    content_type: str
    size_bytes: int
    created_at: datetime


class DraftOut(ORMModel):
    id: UUID
    org_id: UUID
    account_id: UUID
    owner_user_id: str | None
    message_type: MessageType
    in_reply_to: str | None
    references: list[str]
    to_recipients: list[str]
    cc_recipients: list[str]
    bcc_recipients: list[str]
    subject: str
    body_text: str
    body_html: str | None
    editor_mode: EditorMode
    status: DraftStatus
    send_attempts: int
    sent_message_id: str | None
    last_error: str | None
    attachments: list[AttachmentOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    sent_at: datetime | None


class SendResult(BaseModel):
    draft_id: UUID
    status: DraftStatus
    message_id: str | None = None
    warning_codes: list[str] = Field(default_factory=list)


class PreSendCheck(BaseModel):
    warning_codes: list[str] = Field(default_factory=list)
    can_send: bool
