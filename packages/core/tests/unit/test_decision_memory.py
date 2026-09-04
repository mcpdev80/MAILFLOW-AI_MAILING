"""Tests for conservative DecisionMemory matching and reuse."""

from __future__ import annotations

from datetime import UTC, datetime

from mailflow_core.decision_memory import (
    DecisionMemoryCandidate,
    DecisionMemoryMatcher,
    result_for_direct_reuse,
)
from mailflow_core.types import ClassificationResult, ParsedEmail


def _email(subject: str = "Invoice 123") -> ParsedEmail:
    return ParsedEmail(
        uid=1,
        subject_normalized=subject,
        body_text="",
        body_html="",
        signature="",
        from_email="billing@example.com",
        from_domain="example.com",
        thread_id="thread-1",
    )


def _result() -> ClassificationResult:
    return ClassificationResult(
        label="finance",
        confidence=1.0,
        method="decision_memory",
        category="finance",
        importance="normal",
        urgency="none",
        action_required="no",
    )


def _candidate(
    *,
    source: str = "human_confirmed",
    sender_email: str | None = "billing@example.com",
    subject_pattern: str | None = "Invoice 123",
    thread_id: str | None = None,
) -> DecisionMemoryCandidate:
    return DecisionMemoryCandidate(
        entry_id="memory-1",
        account_id="account-1",
        sender_email=sender_email,
        sender_domain="example.com",
        subject_pattern=subject_pattern,
        thread_id=thread_id,
        result=_result(),
        source=source,
        trust_score=1.0,
        updated_at=datetime.now(tz=UTC),
    )


def test_human_sender_subject_match_can_bypass() -> None:
    match = DecisionMemoryMatcher().match(_email(), (_candidate(),))

    assert match is not None
    assert match.can_bypass is True
    reused = result_for_direct_reuse(match)
    assert reused.method == "decision_memory"
    assert reused.decision_memory_id == "memory-1"
    assert reused.decision_memory_hint_used is False


def test_ai_observation_never_bypasses() -> None:
    match = DecisionMemoryMatcher().match(
        _email(),
        (_candidate(source="ai_observed"),),
    )

    assert match is not None
    assert match.can_bypass is False


def test_sender_only_match_is_hint_not_direct_reuse() -> None:
    match = DecisionMemoryMatcher().match(
        _email("Completely different subject"),
        (_candidate(subject_pattern=None),),
    )

    assert match is not None
    assert match.reason == "sender_only"
    assert match.can_bypass is False


def test_disabled_candidate_is_ignored() -> None:
    candidate = DecisionMemoryCandidate(
        **{
            **_candidate().__dict__,
            "enabled": False,
        }
    )
    assert DecisionMemoryMatcher().match(_email(), (candidate,)) is None
