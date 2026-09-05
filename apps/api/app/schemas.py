"""Pydantic schemas (HTTP DTOs) for the MailFlow API.

HTTP contracts stay separate from SQLAlchemy models. Credentials and secrets are
write-only and are never returned by read endpoints.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ActionMode = Literal["off", "review", "automatic"]
SmtpSecurity = Literal["ssl", "starttls", "plain"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ClassificationResultOut(BaseModel):
    """API representation of semantic classification, independent from routing."""

    category: Literal[
        "work",
        "private",
        "finance",
        "orders",
        "appointments",
        "newsletters",
        "notifications",
        "other",
    ]
    subcategory: str | None = None
    suggested_category: str | None = None
    suggested_subcategory: str | None = None
    importance: Literal["critical", "high", "normal", "low", "unknown"]
    urgency: Literal["immediate", "today", "this_week", "none", "unknown"]
    action_required: Literal["yes", "no", "unknown"]
    system_tags: list[str] = Field(default_factory=list)
    user_tags: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    needs_more_context: bool
    review_required: bool
    reason: str | None = Field(default=None, max_length=300)
    classification_stage: int | None = Field(default=None, ge=0, le=3)
    label: str


class EmailAccountCreate(BaseModel):
    imap_host: str = Field(min_length=1, max_length=255)
    imap_port: int = 993
    use_ssl: bool = True
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, repr=False)
    inbox_folder: str = "INBOX"
    unclassified_folder: str = "Sin_Clasificar"
    drafts_folder: str = "Drafts"
    smtp_host: str | None = Field(default=None, max_length=255)
    smtp_port: int | None = Field(default=None, ge=1, le=65535)
    smtp_security: SmtpSecurity = "starttls"
    smtp_username: str | None = Field(default=None, max_length=255)
    smtp_password: str | None = Field(default=None, repr=False)
    interval_minutes: int = Field(default=5, ge=1, le=1440)
    provider_type: str = "imap"
    llm_provider_id: UUID | None = None
    ownership_mode: Literal["private", "shared"] | None = None
    shared_user_ids: list[str] = Field(default_factory=list)
    move_policy: ActionMode = "automatic"
    archive_policy: ActionMode = "off"
    action_confidence_threshold: float = Field(default=0.85, ge=0.0, le=1.0)


class EmailAccountUpdate(BaseModel):
    imap_host: str | None = Field(default=None, max_length=255)
    imap_port: int | None = None
    use_ssl: bool | None = None
    username: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, repr=False)
    inbox_folder: str | None = None
    unclassified_folder: str | None = None
    drafts_folder: str | None = None
    smtp_host: str | None = Field(default=None, max_length=255)
    smtp_port: int | None = Field(default=None, ge=1, le=65535)
    smtp_security: SmtpSecurity | None = None
    smtp_username: str | None = Field(default=None, max_length=255)
    smtp_password: str | None = Field(default=None, repr=False)
    interval_minutes: int | None = Field(default=None, ge=1, le=1440)
    is_active: bool | None = None
    llm_provider_id: UUID | None = None
    move_policy: ActionMode | None = None
    archive_policy: ActionMode | None = None
    action_confidence_threshold: float | None = Field(default=None, ge=0.0, le=1.0)


class EmailAccountOut(ORMModel):
    id: UUID
    org_id: UUID
    owner_user_id: str | None
    ownership_mode: Literal["private", "shared", "unresolved"]
    provider_type: str
    imap_host: str
    imap_port: int
    use_ssl: bool
    username: str
    inbox_folder: str
    unclassified_folder: str
    drafts_folder: str
    smtp_host: str | None
    smtp_port: int | None
    smtp_security: SmtpSecurity
    smtp_username: str | None
    has_smtp_password: bool = False
    interval_minutes: int
    is_active: bool
    last_cycle_at: datetime | None
    llm_provider_id: UUID | None
    move_policy: ActionMode
    archive_policy: ActionMode
    action_confidence_threshold: float
    created_at: datetime


class SharedMailboxAccessOut(ORMModel):
    user_id: str
    can_use: bool
    can_manage: bool


class SharedMailboxAccessReplace(BaseModel):
    user_ids: list[str] = Field(default_factory=list)


class MailboxOwnershipUpdate(BaseModel):
    mode: Literal["private", "shared"]
    target_owner_user_id: str | None = None
    shared_user_ids: list[str] = Field(default_factory=list)


class UserRemovalPrepare(BaseModel):
    action: Literal["transfer", "disable", "delete_local"]
    target_user_id: str | None = None


class UserRemovalPrepareOut(BaseModel):
    owned_mailboxes_resolved: int


class LLMProviderCreate(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    type: str = Field(min_length=1, max_length=50)
    base_url: str = Field(min_length=1, max_length=500)
    api_key: str | None = Field(default=None, repr=False)
    default_classification_model: str = Field(min_length=1, max_length=200)
    default_generation_model: str = Field(min_length=1, max_length=200)


class LLMProviderUpdate(BaseModel):
    label: str | None = Field(default=None, max_length=100)
    type: str | None = Field(default=None, max_length=50)
    base_url: str | None = Field(default=None, max_length=500)
    api_key: str | None = Field(default=None, repr=False)
    default_classification_model: str | None = Field(default=None, max_length=200)
    default_generation_model: str | None = Field(default=None, max_length=200)
    is_active: bool | None = None


class LLMProviderOut(ORMModel):
    id: UUID
    org_id: UUID
    label: str
    type: str
    base_url: str
    default_classification_model: str
    default_generation_model: str
    is_active: bool
    has_api_key: bool = False
    created_at: datetime


class DomainRuleCreate(BaseModel):
    domain: str = Field(min_length=1, max_length=255)
    label: str = Field(min_length=1, max_length=255)
    rule_id: str = Field(min_length=1, max_length=100)
    priority: int = 0


class DomainRuleOut(ORMModel):
    id: UUID
    account_id: UUID
    domain: str
    label: str
    rule_id: str
    priority: int


class KeywordRuleCreate(BaseModel):
    keywords: list[str] = Field(min_length=1)
    label: str = Field(min_length=1, max_length=255)
    rule_id: str = Field(min_length=1, max_length=100)
    priority: int = 0
    match_all: bool = False


class KeywordRuleOut(ORMModel):
    id: UUID
    account_id: UUID
    keywords: list[str]
    label: str
    rule_id: str
    priority: int
    match_all: bool


class InternalDomainCreate(BaseModel):
    domain: str = Field(min_length=1, max_length=255)


class InternalDomainOut(ORMModel):
    id: UUID
    account_id: UUID
    domain: str


class CycleOut(ORMModel):
    id: UUID
    account_id: UUID
    cycle_id: UUID
    emails_processed: int
    drafts_saved: int
    error_count: int
    error_detail: str | None
    duration_ms: int | None
    created_at: datetime
    finalized_at: datetime | None


class CycleEnqueuedOut(BaseModel):
    account_id: UUID
    enqueued: bool
    job_id: str | None = None
