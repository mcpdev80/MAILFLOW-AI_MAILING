"""Authorization-scoped dashboard and cross-mailbox search contracts."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class DashboardCounters(BaseModel):
    total_processed: int = 0
    processed_range: int = 0
    processed_today: int = 0
    pending_or_queued: int = 0
    review_required: int = 0
    urgent: int = 0
    action_required: int = 0
    failed_or_deferred: int = 0
    automated_actions: int = 0
    decision_memory: int = 0
    fast_model: int = 0
    deep_model: int = 0
    active_backfills: int = 0


class DashboardTrendPoint(BaseModel):
    day: str
    processed: int = 0
    review: int = 0
    failures: int = 0


class DashboardBreakdownItem(BaseModel):
    key: str
    count: int


class DashboardMailboxStatus(BaseModel):
    account_id: UUID
    label: str
    ownership_mode: str
    is_active: bool
    last_cycle_at: datetime | None = None
    processed_today: int = 0
    review_count: int = 0
    pending_count: int = 0
    health: str = "healthy"
    last_error: str | None = None
    backfill_status: str | None = None
    backfill_processed: int | None = None
    backfill_total: int | None = None


class DashboardOverview(BaseModel):
    range_days: int
    generated_at: datetime
    counters: DashboardCounters
    trend: list[DashboardTrendPoint]
    categories: list[DashboardBreakdownItem]
    handling: list[DashboardBreakdownItem]
    mailboxes: list[DashboardMailboxStatus]
    inference_status: str = "unknown"
    inference_warning: str | None = None


class MessageSearchItem(BaseModel):
    id: UUID
    account_id: UUID
    account_label: str
    ownership_mode: str
    uid: int
    folder: str
    from_email: str
    subject: str
    processed_at: datetime
    category: str
    subcategory: str | None = None
    importance: str
    urgency: str
    action_required: str
    review_required: bool
    suspicious_content: bool
    system_tags: list[str] = Field(default_factory=list)
    user_tags: list[str] = Field(default_factory=list)
    destination_folder: str
    classification_source: str
    processed_state: str


class MessageSearchResult(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[MessageSearchItem]
