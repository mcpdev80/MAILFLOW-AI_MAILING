"""Pure policy deciding whether processed-message state deserves an audit row."""

from __future__ import annotations

from dataclasses import dataclass

from mailflow_core.action_policy import ActionDecision
from mailflow_core.types import ClassificationResult


@dataclass(frozen=True)
class MessageAuditDecision:
    event: str
    status: str
    details: dict[str, object]


def message_audit_decision(
    *,
    folder: str,
    destination_folder: str,
    classification: ClassificationResult,
    action_decision: ActionDecision,
) -> MessageAuditDecision | None:
    """Return only meaningful long-term events; normal classification is silent."""
    if action_decision.execute:
        return MessageAuditDecision(
            event="message_moved",
            status="success",
            details={
                "from_folder": folder,
                "to_folder": destination_folder,
                "mode": "automatic",
            },
        )
    if classification.suspicious_content and action_decision.requires_review:
        return MessageAuditDecision(
            event="mailbox_action_blocked",
            status="blocked",
            details={
                "action": action_decision.action,
                "reason": action_decision.reason,
            },
        )
    return None
