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
    in_reply_to: str | None = None
    thread_id: str | None = None
    date: str | None = None


@dataclass(frozen=True)
class ClassificationResult:
    """Semantic email classification with legacy ``label`` compatibility.

    ``category`` and the first-class decision fields describe what the message is.
    ``label`` remains only for compatibility with the existing rule/routing path.
    """

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
    reason: str | None = None

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
        if required_unknown or self.needs_more_context:
            object.__setattr__(self, "review_required", True)

    def requires_review(self, confidence_threshold: float) -> bool:
        """Apply the configurable confidence part of the review policy."""
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
    """Input for generating and saving a draft reply."""

    in_reply_to_uid: str
    folder: str
    subject: str
    body_text: str
    body_html: str | None
    classification: ClassificationResult
