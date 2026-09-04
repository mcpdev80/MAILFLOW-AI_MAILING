from __future__ import annotations

from dataclasses import replace

from mailflow_core.action_policy import MailboxActionPolicy, evaluate_mailbox_action
from mailflow_core.types import ClassificationResult


def safe_result(**overrides: object) -> ClassificationResult:
    result = ClassificationResult(
        label="work",
        category="work",
        importance="normal",
        urgency="none",
        action_required="no",
        confidence=0.95,
        method="llm",
    )
    return replace(result, **overrides)


def test_safe_move_executes_by_default() -> None:
    decision = evaluate_mailbox_action(MailboxActionPolicy(), "move", safe_result())

    assert decision.execute is True
    assert decision.disposition == "execute"


def test_move_review_mode_never_executes_automatically() -> None:
    policy = MailboxActionPolicy(move_mode="review")

    decision = evaluate_mailbox_action(policy, "move", safe_result())

    assert decision.requires_review is True
    assert decision.reason == "move_policy_requires_review"


def test_move_off_leaves_message_without_action() -> None:
    policy = MailboxActionPolicy(move_mode="off")

    decision = evaluate_mailbox_action(policy, "move", safe_result())

    assert decision.disposition == "none"
    assert decision.reason == "move_policy_off"


def test_low_confidence_automatic_move_requires_review() -> None:
    policy = MailboxActionPolicy(confidence_threshold=0.9)

    decision = evaluate_mailbox_action(
        policy,
        "move",
        safe_result(confidence=0.89),
    )

    assert decision.requires_review is True
    assert decision.reason == "confidence_below_action_threshold"


def test_unknown_required_value_requires_review() -> None:
    decision = evaluate_mailbox_action(
        MailboxActionPolicy(),
        "move",
        safe_result(urgency="unknown", review_required=False),
    )

    assert decision.requires_review is True
    assert decision.reason == "required_classification_value_unknown"


def test_suspicious_content_requires_review() -> None:
    decision = evaluate_mailbox_action(
        MailboxActionPolicy(),
        "move",
        safe_result(suspicious_content=True, review_required=False),
    )

    assert decision.requires_review is True
    assert decision.reason == "suspicious_content"


def test_archive_uses_same_safety_rules() -> None:
    policy = MailboxActionPolicy(archive_mode="automatic")

    assert evaluate_mailbox_action(policy, "archive", safe_result()).execute is True
    assert (
        evaluate_mailbox_action(
            policy,
            "archive",
            safe_result(needs_more_context=True),
        ).disposition
        == "review"
    )


def test_delete_and_send_are_blocked_without_explicit_approval_paths() -> None:
    policy = MailboxActionPolicy()
    result = safe_result()

    delete_decision = evaluate_mailbox_action(policy, "delete", result)
    send_decision = evaluate_mailbox_action(policy, "send", result)

    assert delete_decision.disposition == "blocked"
    assert send_decision.disposition == "blocked"


def test_invalid_policy_values_fail_closed() -> None:
    try:
        MailboxActionPolicy(move_mode="invalid")  # type: ignore[arg-type]
    except ValueError as exc:
        assert "unsupported move mode" in str(exc)
    else:
        raise AssertionError("invalid move policy should fail")
