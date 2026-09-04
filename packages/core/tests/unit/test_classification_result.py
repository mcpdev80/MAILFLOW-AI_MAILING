"""Semantic classification result validation and review policy tests."""

from __future__ import annotations

import pytest

from mailflow_core.types import ClassificationResult


def test_semantic_result_keeps_category_separate_from_legacy_label() -> None:
    result = ClassificationResult(
        label="Invoices",
        category="finance",
        subcategory="invoice",
        importance="high",
        urgency="today",
        action_required="yes",
        confidence=0.92,
        method="llm",
    )

    assert result.label == "Invoices"
    assert result.category == "finance"
    assert result.system_tags == ("today", "action_required")
    assert result.review_required is False


def test_unknown_required_decision_forces_review() -> None:
    result = ClassificationResult(
        label="other",
        category="other",
        importance="unknown",
        urgency="none",
        action_required="no",
        confidence=0.9,
        method="llm",
        reason="Importance could not be determined",
    )

    assert result.review_required is True
    assert result.system_tags == ("information_only",)


def test_more_context_forces_review() -> None:
    result = ClassificationResult(
        label="work",
        category="work",
        importance="normal",
        urgency="none",
        action_required="no",
        confidence=0.8,
        method="llm",
        needs_more_context=True,
        reason="Thread context is missing",
    )

    assert result.review_required is True


def test_configurable_confidence_threshold_requires_review() -> None:
    result = ClassificationResult(
        label="orders",
        category="orders",
        importance="normal",
        urgency="none",
        action_required="no",
        confidence=0.69,
        method="llm",
    )

    assert result.requires_review(0.70) is True
    assert result.requires_review(0.60) is False


def test_suggestion_can_be_returned_for_other_category() -> None:
    result = ClassificationResult(
        label="other",
        category="other",
        suggested_category="travel",
        suggested_subcategory="flight-change",
        importance="normal",
        urgency="today",
        action_required="yes",
        confidence=0.75,
        method="llm",
    )

    assert result.suggested_category == "travel"
    assert result.suggested_subcategory == "flight-change"


def test_confidence_outside_range_is_rejected() -> None:
    with pytest.raises(ValueError, match="confidence"):
        ClassificationResult(
            label="work",
            category="work",
            confidence=1.1,
            method="llm",
        )


def test_unknown_persistent_category_is_rejected() -> None:
    with pytest.raises(ValueError, match="unsupported category"):
        ClassificationResult(
            label="travel",
            category="travel",  # type: ignore[arg-type]
            confidence=0.9,
            method="llm",
        )
