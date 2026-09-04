"""Schemas for dry-run proposal review and resumable apply."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BulkProposalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    job_id: UUID
    account_id: UUID
    source_folder: str
    uidvalidity: int
    uid: int
    version: int
    status: str
    original_snapshot: dict
    edited_snapshot: dict | None
    approved_snapshot: dict | None
    approval_user_id: str | None
    approved_at: datetime | None
    applied_at: datetime | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime


class BulkProposalEdit(BaseModel):
    category: str | None = None
    subcategory: str | None = None
    importance: str | None = None
    urgency: str | None = None
    action_required: str | None = None
    proposed_folder: str | None = Field(default=None, min_length=1, max_length=255)
    system_tags: list[str] | None = None
    user_tags: list[str] | None = None
    do_move: bool | None = None

    def changes(self) -> dict:
        return self.model_dump(exclude_none=True)


class BulkCountsOut(BaseModel):
    counts: dict[str, int]


class BulkApproveAllOut(BaseModel):
    approved: int


class BulkApplyCreate(BaseModel):
    batch_size: int = Field(default=10, ge=1, le=100)


class BulkApplyJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    source_job_id: UUID
    account_id: UUID
    state: str
    batch_size: int
    approved: int
    processed: int
    applied: int
    skipped: int
    failed: int
    review_required: int
    last_error: str | None
    created_at: datetime
    updated_at: datetime


class BulkApplyControlOut(BaseModel):
    job: BulkApplyJobOut
    enqueued: bool
