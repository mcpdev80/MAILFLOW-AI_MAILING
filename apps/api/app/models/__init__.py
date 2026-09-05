"""Re-export models so Alembic can discover them through Base.metadata."""

from app.models.audit_log import AuditLog
from app.models.backfill import BackfillFailure, BackfillJob
from app.models.base import Base
from app.models.bulk import BulkApplyJob, BulkProposal
from app.models.decision_memory import DecisionMemoryEntry
from app.models.email_account import EmailAccount
from app.models.lifecycle_event import LifecycleEvent
from app.models.llm_provider import LLMProvider
from app.models.mailbox_access import MailboxAccess
from app.models.organization import Organization
from app.models.outbound_draft import OutboundDraft, OutboundDraftAttachment
from app.models.processed_email import ProcessedEmail
from app.models.rules import DomainRule, InternalDomain, KeywordRule
from app.models.stripe_event import StripeEvent
from app.models.thread_summary import ThreadSummary

__all__ = [
    "Base",
    "AuditLog",
    "BackfillFailure",
    "BackfillJob",
    "BulkApplyJob",
    "BulkProposal",
    "DecisionMemoryEntry",
    "DomainRule",
    "EmailAccount",
    "InternalDomain",
    "KeywordRule",
    "LifecycleEvent",
    "LLMProvider",
    "MailboxAccess",
    "Organization",
    "OutboundDraft",
    "OutboundDraftAttachment",
    "ProcessedEmail",
    "StripeEvent",
    "ThreadSummary",
]
