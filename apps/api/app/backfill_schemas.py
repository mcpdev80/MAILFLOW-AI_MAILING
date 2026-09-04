"""Schemas for resumable historical mailbox backfill controls and progress."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BackfillCreate(BaseModel):
    folder: str = Field(default="INBOX", min_length=1, max_length=255)
    mode: Literal["dry_run", "review", "apply"] = "dry_run"
    batch_size: int | None = Field(default=None, ge=1, le=100)


class BackfillJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    account_id: UUID
    folder: str
    state: str
    mode: str
    batch_size: int
    uidvalidity: int | None
    cursor_uid: int | None
    total_discovered: int
    processed: int
    successful: int
    review_required: int
    failed: int
    last_error: str | None
    created_at: datetime
    updated_at: datetime


class BackfillProgressOut(BackfillJobOut):
    remaining: int = 0

    @classmethod
    def from_job(cls, job: object) -> "BackfillProgressOut":
        data = BackfillJobOut.model_validate(job).model_dump()
        data["remaining"] = max(data["total_discovered"] - data["processed"], 0)
        return cls(**data)


class BackfillFailureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    job_id: UUID
    uidvalidity: int
    uid: int
    status: str
    attempts: int
    classification_stage: int | None
    review_required: bool
    last_error: str | None
    created_at: datetime
    updated_at: datetime


class BackfillControlOut(BaseModel):
    job: BackfillProgressOut
    enqueued: bool = False


class BackfillFailureRetryOut(BaseModel):
    failure: BackfillFailureOut
    enqueued: bool = False
