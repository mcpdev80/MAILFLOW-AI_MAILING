"""Shared DTOs used across all core modules."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

ClassificationMethod = Literal[
    "domain_internal",
    "domain_client",
    "thread",
    "keyword",
    "llm",
    "fallback",
    "decision_memory",
]
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
SpfResult = Literal["pass", "fail", "softfail", "neutral", "none", "unknown"]
AuthResult = Literal["pass", "fail", "none", "unknown"]
DmarcResult = Literal["pass", "fail", "bestguesspass", "none", "unknown"]
SpamVerdict = Literal["spam", "suspicious", "clean", "unknown"]
AttachmentExtractionStatus = Literal["not_needed", "used", "skipped", "failed"]

CONFIRMED_CATEGORIES: tuple[Category, ...] = (
    "work",
    "private",
    "finance",
    "orders",
    "appointments",
    "newsletters",
    "notifications",
    "other",
)
SYSTEM_TAGS: frozenset[str] = frozenset(
    {
        "urgent",
        "action_required",
        "today",
        "this_week",
        "information_only",
        "follow_up",
    }
)


@dataclass(frozen=True)
class MailAuthSignals:
    """Normalized authentication and spam metadata derived from message headers."""

    spf: SpfResult = "unknown"
    dkim: AuthResult = "unknown"
    dmarc: DmarcResult = "unknown"
    arc: AuthResult = "unknown"
    spam_verdict: SpamVerdict = "unknown"
    spam_score: float | None = None

    def compact(self) -> str:
        parts = [
            f"spf={self.spf}",
            f"dkim={self.dkim}",
            f"dmarc={self.dmarc}",
            f"arc={self.arc}",
            f"spam={self.spam_verdict}",
        ]
        if self.spam_score is not None:
            parts.append(f"score={self.spam_score:g}")
        return " ".join(parts)


@dataclass(frozen=True)
class AttachmentInfo:
    """Lightweight attachment metadata carried with a message without downloading content."""

    part_id: str
    filename: str
    mime_type: str
    size: int | None = None
    disposition: str | None = None


@dataclass(frozen=True)
class ParsedEmail:
    """Refined email data produced by EmailParser."""

    uid: int
    subject_normalized: str
    body_text: str
    body_html: str
    signature: str
    from_email: str
    from_domain: str
    to_emails: list[str] = field(default_factory=list)
    message_id: str | None = None
    in_reply_to: str | None = None
    references: tuple[str, ...] = ()
    reply_to: str | None = None
    list_id: str | None = None
    precedence: str | None = None
    thread_id: str | None = None
    date: str | None = None
    auth_signals: MailAuthSignals = field(default_factory=MailAuthSignals)
    attachments: tuple[AttachmentInfo, ...] = ()


@dataclass(frozen=True)
class ThreadSummaryUpdate:
    summary: str
    changed: bool
    open_action_required: bool
    deadline: str | None = None


@dataclass(frozen=True)
class ClassificationResult:
    """Semantic email classification with legacy ``label`` compatibility."""

    label: str
    confidence: float
    method: ClassificationMethod
    rule_id: str | None = None
    category: Category = "other"
    subcategory: str | None = None
    suggested_category: str | None = None
    suggested_subcategory: str | None = None
    importance: Importance = "unknown"
    urgency: Urgency = "unknown"
    action_required: ActionRequired = "unknown"
    system_tags: tuple[str, ...] = ()
    user_tags: tuple[str, ...] = ()
    needs_more_context: bool = False
    review_required: bool = False
    suspicious_content: bool = False
    reason: str | None = None
    classification_stage: int | None = None
    classification_model: str | None = None
    attachment_context_used: bool = False
    attachment_types_used: tuple[str, ...] = ()
    attachment_extraction_status: AttachmentExtractionStatus = "not_needed"
    attachment_extraction_error: str | None = None
    decision_memory_id: str | None = None
    decision_memory_match_confidence: float | None = None
    decision_memory_hint_used: bool = False
    # Deep classification can optionally return the compact thread update in the
    # same response so the worker does not need a second model call.
    thread_summary_update: ThreadSummaryUpdate | None = None

    def __post_init__(self) -> None:
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("confidence must be between 0.0 and 1.0")
        if self.category not in CONFIRMED_CATEGORIES:
            raise ValueError(f"unsupported category: {self.category}")
        if self.importance not in {"critical", "high", "normal", "low", "unknown"}:
            raise ValueError(f"unsupported importance: {self.importance}")
        if self.urgency not in {"immediate", "today", "this_week", "none", "unknown"}:
            raise ValueError(f"unsupported urgency: {self.urgency}")
        if self.action_required not in {"yes", "no", "unknown"}:
            raise ValueError(f"unsupported action_required: {self.action_required}")
        if self.classification_stage is not None and self.classification_stage not in {0, 1, 2, 3}:
            raise ValueError("classification_stage must be 0, 1, 2, 3 or None")
        if self.attachment_extraction_status not in {"not_needed", "used", "skipped", "failed"}:
            raise ValueError(
                f"unsupported attachment extraction status: {self.attachment_extraction_status}"
            )
        if (
            self.decision_memory_match_confidence is not None
            and not 0.0 <= self.decision_memory_match_confidence <= 1.0
        ):
            raise ValueError("decision_memory_match_confidence must be between 0.0 and 1.0")
        unsupported_tags = set(self.system_tags) - SYSTEM_TAGS
        if unsupported_tags:
            raise ValueError(f"unsupported system tags: {sorted(unsupported_tags)}")

        derived_tags = list(self.system_tags)
        for tag in _derived_system_tags(self):
            if tag not in derived_tags:
                derived_tags.append(tag)
        object.__setattr__(self, "system_tags", tuple(derived_tags))

        required_unknown = (
            self.importance == "unknown"
            or self.urgency == "unknown"
            or self.action_required == "unknown"
        )
        if required_unknown or self.needs_more_context or self.suspicious_content:
            object.__setattr__(self, "review_required", True)

    def requires_review(self, confidence_threshold: float) -> bool:
        if not 0.0 <= confidence_threshold <= 1.0:
            raise ValueError("confidence_threshold must be between 0.0 and 1.0")
        return self.review_required or self.confidence < confidence_threshold


def _derived_system_tags(result: ClassificationResult) -> tuple[str, ...]:
    tags: list[str] = []
    if result.urgency == "immediate":
        tags.append("urgent")
    elif result.urgency == "today":
        tags.append("today")
    elif result.urgency == "this_week":
        tags.append("this_week")
    if result.action_required == "yes":
        tags.append("action_required")
    elif result.action_required == "no":
        tags.append("information_only")
    return tuple(tags)


@dataclass(frozen=True)
class DraftRequest:
    in_reply_to_uid: str
    folder: str
    subject: str
    body_text: str
    body_html: str | None
    classification: ClassificationResult
