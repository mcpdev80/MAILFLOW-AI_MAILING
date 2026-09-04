"""HTTP DTOs for inspecting and managing trusted DecisionMemory entries."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

Category = Literal[
    "work",
    "private",
    "finance",
    "orders",
    "appointments",
    "newsletters",
    "notifications",
    "other",
]
Importance = Literal["critical", "high", "normal", "low", "unknown"]
Urgency = Literal["immediate", "today", "this_week", "none", "unknown"]
ActionRequired = Literal["yes", "no", "unknown"]
TrustedSource = Literal["human_confirmed", "human_corrected"]


class DecisionMemoryWrite(BaseModel):
    """Full replacement payload for one explicit trusted decision."""

    sender_email: str | None = Field(default=None, max_length=500)
    sender_domain: str | None = Field(default=None, max_length=255)
    subject_pattern: str | None = Field(default=None, max_length=500)
    thread_id: str | None = Field(default=None, max_length=500)
    category: Category
    subcategory: str | None = Field(default=None, max_length=255)
    importance: Importance
    urgency: Urgency
    action_required: ActionRequired
    system_tags: list[str] = Field(default_factory=list)
    user_tags: list[str] = Field(default_factory=list)
    routing_target: str | None = Field(default=None, max_length=255)
    source: TrustedSource = "human_confirmed"
    trust_score: float = Field(default=1.0, ge=0.0, le=1.0)
    enabled: bool = True

    @model_validator(mode="after")
    def _require_match_identity(self) -> "DecisionMemoryWrite":
        if not any(
            value and value.strip()
            for value in (self.sender_email, self.sender_domain, self.thread_id)
        ):
            raise ValueError("sender_email, sender_domain or thread_id is required")
        return self


class DecisionMemoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    account_id: UUID
    sender_email: str | None
    sender_domain: str | None
    subject_pattern: str | None
    thread_id: str | None
    category: Category
    subcategory: str | None
    importance: Importance
    urgency: Urgency
    action_required: ActionRequired
    system_tags: list[str]
    user_tags: list[str]
    routing_target: str | None
    source: Literal["human_confirmed", "human_corrected", "ai_observed"]
    trust_score: float
    enabled: bool
    hit_count: int
    last_used: datetime | None
    superseded_by_id: UUID | None
    created_at: datetime
    updated_at: datetime
