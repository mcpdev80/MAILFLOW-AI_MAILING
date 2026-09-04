"""Tests for adaptive staged classification."""

from __future__ import annotations

from dataclasses import replace
from unittest.mock import MagicMock

from mailflow_core.classification.adaptive import (
    AdaptiveClassificationConfig,
    AdaptiveClassifier,
)
from mailflow_core.types import ClassificationResult, ParsedEmail


def email(body: str = "") -> ParsedEmail:
    return ParsedEmail(
        uid=1,
        subject_normalized="Invoice question",
        body_text=body,
        body_html="",
        signature="",
        from_email="customer@example.com",
        from_domain="example.com",
        to_emails=["me@company.com"],
        message_id="<m1@example.com>",
        date="Fri, 4 Sep 2026 10:00:00 +0200",
    )


def result(
    confidence: float,
    *,
    needs_more_context: bool = False,
    review_required: bool = False,
) -> ClassificationResult:
    return ClassificationResult(
        label="finance",
        category="finance",
        importance="normal",
        urgency="none",
        action_required="no",
        confidence=confidence,
        method="llm",
        needs_more_context=needs_more_context,
        review_required=review_required,
    )


def test_stops_after_confident_stage_zero_without_loading_body():
    llm = MagicMock()
    llm.classify.return_value = result(0.93)
    loader = MagicMock()

    outcome = AdaptiveClassifier(llm).classify(
        email(),
        thread_summary="Customer asks about September invoice.",
        body_loader=loader,
    )

    assert outcome.stage == 0
    assert outcome.result.classification_stage == 0
    loader.assert_not_called()
    assert llm.classify.call_count == 1


def test_escalates_through_requested_body_sizes_and_stops_at_stage_two():
    llm = MagicMock()
    llm.classify.side_effect = [
        result(0.70),
        result(0.90, needs_more_context=True),
        result(0.91),
    ]
    requested: list[int | None] = []

    def loader(limit: int | None) -> ParsedEmail:
        requested.append(limit)
        body = "x" * (limit or 10_000)
        return replace(email(), body_text=body)

    outcome = AdaptiveClassifier(llm).classify(
        email(),
        thread_summary=None,
        body_loader=loader,
    )

    assert outcome.stage == 2
    assert requested == [1_000, 4_000]
    assert llm.classify.call_count == 3


def test_review_flag_forces_escalation_even_above_confidence_threshold():
    llm = MagicMock()
    llm.classify.side_effect = [result(0.97, review_required=True), result(0.91)]
    loader = MagicMock(return_value=replace(email(), body_text="body"))

    outcome = AdaptiveClassifier(llm).classify(
        email(),
        thread_summary=None,
        body_loader=loader,
    )

    assert outcome.stage == 1
    loader.assert_called_once_with(1_000)


def test_configurable_threshold_controls_escalation():
    llm = MagicMock()
    llm.classify.return_value = result(0.82)
    loader = MagicMock()
    classifier = AdaptiveClassifier(
        llm,
        config=AdaptiveClassificationConfig(confidence_threshold=0.80),
    )

    outcome = classifier.classify(email(), thread_summary=None, body_loader=loader)

    assert outcome.stage == 0
    loader.assert_not_called()


def test_decision_memory_bypasses_llm_and_body_fetch():
    remembered = replace(result(0.96), method="decision_memory")
    memory = MagicMock()
    memory.lookup.return_value = remembered
    llm = MagicMock()
    loader = MagicMock()

    outcome = AdaptiveClassifier(llm, decision_memory=memory).classify(
        email(),
        thread_summary="Known recurring sender and intent.",
        body_loader=loader,
    )

    assert outcome.decision_memory_hit is True
    assert outcome.stage is None
    assert outcome.result.method == "decision_memory"
    llm.classify.assert_not_called()
    loader.assert_not_called()


def test_stage_three_uses_full_body_loader():
    llm = MagicMock()
    llm.classify.side_effect = [result(0.1), result(0.2), result(0.3), result(0.4)]
    requested: list[int | None] = []

    def loader(limit: int | None) -> ParsedEmail:
        requested.append(limit)
        return replace(email(), body_text="full" if limit is None else "partial")

    outcome = AdaptiveClassifier(llm).classify(
        email(),
        thread_summary=None,
        body_loader=loader,
    )

    assert outcome.stage == 3
    assert requested == [1_000, 4_000, None]
    assert outcome.email.body_text == "full"
