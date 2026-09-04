"""Schemas for the lightweight activity/audit trail."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditEventOut(BaseModel):
    id: UUID
    account_id: UUID | None
    message_ref: str | None
    actor_user_id: str | None
    actor_type: str
    event: str
    status: str
    details: dict
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
