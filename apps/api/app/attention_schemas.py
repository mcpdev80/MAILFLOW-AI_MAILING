"""API contracts for review inbox, notifications and daily summary."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AttentionCounters(BaseModel):
    urgent: int = 0
    action_required: int = 0
    review_needed: int = 0
    failures: int = 0
    security: int = 0
    unread_notifications: int = 0


class ReviewItem(BaseModel):
    id: UUID
    account_id: UUID
    account_label: str
    ownership_mode: str
    uid: int
    folder: str
    thread_id: str | None = None
    subject: str
    from_email: str
    category: str
    subcategory: str | None = None
    importance: str
    urgency: str
    action_required: str
    confidence: float
    reason: str
    review_type: str
    priority: int
    destination_folder: str
    system_tags: list[str] = Field(default_factory=list)
    user_tags: list[str] = Field(default_factory=list)
    suspicious_content: bool = False
    action_review_required: bool = False
    processed_at: datetime


class ReviewInbox(BaseModel):
    items: list[ReviewItem]
    counters: AttentionCounters


class ReviewCorrection(BaseModel):
    category: str | None = Field(default=None, max_length=64)
    subcategory: str | None = Field(default=None, max_length=255)
    importance: str | None = Field(default=None, max_length=32)
    urgency: str | None = Field(default=None, max_length=32)
    action_required: str | None = Field(default=None, max_length=16)
    destination_folder: str | None = Field(default=None, max_length=255)
    system_tags: list[str] | None = None
    user_tags: list[str] | None = None
    routing_decision: str | None = Field(default=None, pattern="^(approve|reject)$")
    dismiss: bool = False
    remember: bool = True


class NotificationPreferenceView(BaseModel):
    urgent_enabled: bool = True
    security_review_enabled: bool = True
    jobs_enabled: bool = True
    mailbox_health_enabled: bool = True
    daily_summary_enabled: bool = True
    daily_summary_hour: int = Field(default=8, ge=0, le=23)
    timezone: str = Field(default="UTC", min_length=1, max_length=64)


class NotificationView(BaseModel):
    id: UUID
    account_id: UUID | None = None
    event_type: str
    severity: str
    title: str
    body: str
    read_at: datetime | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    metadata: dict = Field(default_factory=dict)


class NotificationCenter(BaseModel):
    notifications: list[NotificationView]
    unread: int
    counters: AttentionCounters


class DailySummaryItem(BaseModel):
    account_id: UUID
    account_label: str
    message_id: UUID
    subject: str
    from_email: str
    category: str
    importance: str
    urgency: str
    action_required: str
    reason: str | None = None


class DailySummary(BaseModel):
    generated_at: datetime
    since: datetime
    counters: AttentionCounters
    urgent: list[DailySummaryItem] = Field(default_factory=list)
    action_required: list[DailySummaryItem] = Field(default_factory=list)
    awaiting_review: list[DailySummaryItem] = Field(default_factory=list)
    important_new: list[DailySummaryItem] = Field(default_factory=list)
    failures: list[DailySummaryItem] = Field(default_factory=list)
