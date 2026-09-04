from __future__ import annotations

from mailflow_core.action_policy import ActionDecision
from mailflow_core.types import ClassificationResult

from app.audit_policy import message_audit_decision
from app.lifecycle import _compact_details


def _classification(**overrides) -> ClassificationResult:
    values = {
        "label": "finance",
        "category": "finance",
        "subcategory": "invoices",
        "confidence": 0.95,
        "method": "llm",
        "importance": "normal",
        "urgency": "none",
        "action_required": "no",
    }
    values.update(overrides)
    return ClassificationResult(**values)


def test_normal_classification_without_mailbox_mutation_is_quiet() -> None:
    audit = message_audit_decision(
        folder="INBOX",
        destination_folder="INBOX",
        classification=_classification(confidence=0.70, review_required=True),
        action_decision=ActionDecision(
            action="move",
            disposition="review",
            reason="confidence_below_action_threshold",
        ),
    )
    assert audit is None


def test_successful_mailbox_move_creates_compact_event() -> None:
    audit = message_audit_decision(
        folder="INBOX",
        destination_folder="Rechnungen",
        classification=_classification(),
        action_decision=ActionDecision(
            action="move",
            disposition="execute",
            reason="safe_automatic_action",
        ),
    )
    assert audit is not None
    assert audit.event == "message_moved"
    assert audit.status == "success"
    assert audit.details == {
        "from_folder": "INBOX",
        "to_folder": "Rechnungen",
        "mode": "automatic",
    }


def test_suspicious_mail_action_review_creates_blocked_event() -> None:
    audit = message_audit_decision(
        folder="INBOX",
        destination_folder="INBOX",
        classification=_classification(suspicious_content=True, review_required=True),
        action_decision=ActionDecision(
            action="move",
            disposition="review",
            reason="suspicious_content",
        ),
    )
    assert audit is not None
    assert audit.event == "mailbox_action_blocked"
    assert audit.status == "blocked"
    assert audit.details["reason"] == "suspicious_content"


def test_compact_details_drops_sensitive_and_bounds_values() -> None:
    details = _compact_details(
        {
            "body_text": "never persist this",
            "prompt": "never persist this either",
            "reason": "x" * 700,
            "count": 3,
            "flags": ["a", "b"],
        }
    )
    assert "body_text" not in details
    assert "prompt" not in details
    assert len(details["reason"]) == 500
    assert details["count"] == 3
    assert details["flags"] == ["a", "b"]
