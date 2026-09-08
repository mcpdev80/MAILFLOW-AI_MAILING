from __future__ import annotations

from dataclasses import replace

from mailflow_core.classification.adaptive import (
    AdaptiveClassificationConfig,
    AdaptiveClassifier,
)
from mailflow_core.types import ClassificationResult, ParsedEmail


class _FakeLLM:
    def __init__(self, results: list[ClassificationResult]) -> None:
        self.results = list(results)
        self.stages: list[int] = []

    def classify(self, email, **kwargs):
        self.stages.append(kwargs["classification_stage"])
        return self.results.pop(0)


def _email() -> ParsedEmail:
    return ParsedEmail(
        uid=1,
        subject_normalized="Test",
        body_text="",
        body_html="",
        signature="",
        from_email="sender@example.com",
        from_domain="example.com",
    )


def _result(confidence: float, *, method: str = "llm") -> ClassificationResult:
    return ClassificationResult(
        label="orders",
        confidence=confidence,
        method=method,
        category="orders",
        importance="normal",
        urgency="none",
        action_required="no",
    )


def test_adaptive_max_stage_stops_and_marks_review() -> None:
    llm = _FakeLLM([_result(0.4), _result(0.6)])
    body_loads: list[int | None] = []

    def load_body(max_chars: int | None) -> ParsedEmail:
        body_loads.append(max_chars)
        return replace(_email(), body_text="body")

    outcome = AdaptiveClassifier(
        llm,
        config=AdaptiveClassificationConfig(
            confidence_threshold=0.85,
            max_stage=1,
        ),
    ).classify(
        _email(),
        thread_summary=None,
        body_loader=load_body,
    )

    assert llm.stages == [0, 1]
    assert body_loads == [1_000]
    assert outcome.stage == 1
    assert outcome.result.review_required is True


def test_supporting_signal_can_bypass_llm_on_backfill_fast_path() -> None:
    llm = _FakeLLM([])
    supporting = _result(0.96, method="keyword")

    outcome = AdaptiveClassifier(
        llm,
        config=AdaptiveClassificationConfig(
            confidence_threshold=0.85,
            max_stage=1,
            allow_supporting_signal_bypass=True,
        ),
    ).classify(
        _email(),
        thread_summary=None,
        body_loader=lambda _limit: _email(),
        supporting_signal=supporting,
    )

    assert llm.stages == []
    assert outcome.stage is None
    assert outcome.result is supporting
