"""API schemas for the global attachment library."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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
    category: str | None
    subcategory: str | None
    tags: list[str]
    folder_id: UUID | None
    source_count: int
    created_at: datetime
    updated_at: datetime


class AttachmentDocumentDetail(AttachmentDocumentListItem):
    extracted_text: str | None
    sources: list[AttachmentSourceOut]


class AttachmentCorrection(BaseModel):
    folder_id: UUID | None = None
    category: str | None = Field(default=None, max_length=100)
    subcategory: str | None = Field(default=None, max_length=150)
    tags: list[str] = Field(default_factory=list, max_length=50)
    remember: bool = False


class AttachmentFolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    parent_id: UUID | None = None


class AttachmentFolderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    parent_id: UUID | None = None
    pinned: bool | None = None


class AttachmentFolderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    parent_id: UUID | None
    name: str
    managed_by: str
    pinned: bool
    created_at: datetime
    updated_at: datetime


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
