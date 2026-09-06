"""API schemas for the global attachment library."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AttachmentSourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    account_id: UUID
    uid: int
    folder: str
    message_id: str | None
    thread_id: str | None
    from_email: str
    subject: str
    received_at: datetime | None
    source_filename: str
    mime_type: str
    size_bytes: int | None


class AttachmentDocumentListItem(BaseModel):
    id: UUID
    canonical_filename: str
    mime_type: str
    size_bytes: int
    analysis_status: str
    document_type: str | None
    ai_category: str | None
    ai_subcategory: str | None
    ai_confidence: float | None
    tags: list[str]
    user_folder_id: UUID | None
    source_count: int
    created_at: datetime
    updated_at: datetime


class AttachmentDocumentDetail(AttachmentDocumentListItem):
    sources: list[AttachmentSourceOut]


class BlockedAttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    account_id: UUID
    uid: int
    folder: str
    message_id: str | None
    from_email: str
    subject: str
    received_at: datetime | None
    source_filename: str
    mime_type: str
    size_bytes: int | None
    safety_reason: str | None
    created_at: datetime
