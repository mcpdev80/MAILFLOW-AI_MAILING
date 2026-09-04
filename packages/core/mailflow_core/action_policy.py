"""Mailbox action policy evaluated after semantic classification."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from mailflow_core.types import ClassificationResult

ActionMode = Literal["off", "review", "automatic"]
MailboxAction = Literal["move", "archive", "delete", "send"]
ActionDisposition = Literal["execute", "review", "blocked", "none"]


@dataclass(frozen=True)
class MailboxActionPolicy:
    """Mailbox-scoped policy controlling automatic side effects."""

    move_mode: ActionMode = "automatic"
    archive_mode: ActionMode = "off"
    confidence_threshold: float = 0.85

    def __post_init__(self) -> None:
        allowed_modes = {"off", "review", "automatic"}
        if self.move_mode not in allowed_modes:
            raise ValueError(f"unsupported move mode: {self.move_mode}")
        if self.archive_mode not in allowed_modes:
            raise ValueError(f"unsupported archive mode: {self.archive_mode}")
        if not 0.0 <= self.confidence_threshold <= 1.0:
            raise ValueError("confidence_threshold must be between 0.0 and 1.0")


@dataclass(frozen=True)
class ActionDecision:
    """Result of evaluating one mailbox side effect."""

    action: MailboxAction
    disposition: ActionDisposition
    reason: str

    @property
    def execute(self) -> bool:
        return self.disposition == "execute"

    @property
    def requires_review(self) -> bool:
        return self.disposition == "review"


def evaluate_mailbox_action(
    policy: MailboxActionPolicy,
    action: MailboxAction,
    classification: ClassificationResult,
) -> ActionDecision:
    """Evaluate a mailbox action without performing any provider operation."""
    if action == "delete":
        return ActionDecision(action, "blocked", "delete_requires_explicit_opt_in")
    if action == "send":
        return ActionDecision(action, "blocked", "send_requires_explicit_approval")

    mode = policy.move_mode if action == "move" else policy.archive_mode
    if mode == "off":
        return ActionDecision(action, "none", f"{action}_policy_off")
    if mode == "review":
        return ActionDecision(action, "review", f"{action}_policy_requires_review")

    if classification.label == "unclassified":
        return ActionDecision(action, "review", "classification_unclassified")
    if classification.suspicious_content:
        return ActionDecision(action, "review", "suspicious_content")
    if classification.needs_more_context:
        return ActionDecision(action, "review", "needs_more_context")
    if (
        classification.importance == "unknown"
        or classification.urgency == "unknown"
        or classification.action_required == "unknown"
    ):
        return ActionDecision(action, "review", "required_classification_value_unknown")
    if classification.review_required:
        return ActionDecision(action, "review", "classification_requires_review")
    if classification.confidence < policy.confidence_threshold:
        return ActionDecision(action, "review", "confidence_below_action_threshold")

    return ActionDecision(action, "execute", "safe_automatic_action")
