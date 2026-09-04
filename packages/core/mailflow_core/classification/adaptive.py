"""Adaptive multi-stage classification orchestration.

The classifier starts with headers only and requests progressively more cleaned body
content only when the previous result is not reliable enough.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, replace
from typing import Protocol

from mailflow_core.mail_auth import auth_signals_block_memory_reuse
from mailflow_core.types import ClassificationResult, ParsedEmail

BodyLoader = Callable[[int | None], ParsedEmail]


class DecisionMemoryLookup(Protocol):
    """Minimal lookup boundary implemented by persistent DecisionMemory later."""

    def lookup(
        self,
        email: ParsedEmail,
        thread_summary: str | None,
    ) -> ClassificationResult | None: ...


@dataclass(frozen=True)
class AdaptiveClassificationConfig:
    confidence_threshold: float = 0.85
    stage_1_chars: int = 1_000
    stage_2_chars: int = 4_000

    def __post_init__(self) -> None:
        if not 0.0 <= self.confidence_threshold <= 1.0:
            raise ValueError("confidence_threshold must be between 0.0 and 1.0")
        if self.stage_1_chars <= 0 or self.stage_2_chars <= self.stage_1_chars:
            raise ValueError("stage body limits must be positive and increasing")


@dataclass(frozen=True)
class AdaptiveClassificationOutcome:
    result: ClassificationResult
    email: ParsedEmail
    stage: int | None
    decision_memory_hit: bool = False


class AdaptiveClassifier:
    """Run the LLM in stages and stop after the first reliable result."""

    def __init__(
        self,
        llm_client: object,
        *,
        config: AdaptiveClassificationConfig | None = None,
        decision_memory: DecisionMemoryLookup | None = None,
    ) -> None:
        self._llm = llm_client
        self._config = config or AdaptiveClassificationConfig()
        self._memory = decision_memory

    def classify(
        self,
        headers_only: ParsedEmail,
        *,
        thread_summary: str | None,
        body_loader: BodyLoader,
        supporting_signal: ClassificationResult | None = None,
    ) -> AdaptiveClassificationOutcome:
        if self._memory is not None and not auth_signals_block_memory_reuse(
            headers_only.auth_signals
        ):
            remembered = self._memory.lookup(headers_only, thread_summary)
            if remembered is not None and self._is_reliable(remembered):
                return AdaptiveClassificationOutcome(
                    result=remembered,
                    email=headers_only,
                    stage=None,
                    decision_memory_hit=True,
                )

        stages: tuple[tuple[int, int | None], ...] = (
            (0, 0),
            (1, self._config.stage_1_chars),
            (2, self._config.stage_2_chars),
            (3, None),
        )
        previous_result: ClassificationResult | None = None
        current = headers_only

        for stage, body_limit in stages:
            if stage > 0:
                current = body_loader(body_limit)
            result = self._llm.classify(
                current,
                thread_summary=thread_summary,
                supporting_signal=supporting_signal,
                previous_result=previous_result,
                classification_stage=stage,
            )
            result = replace(result, classification_stage=stage)
            if self._is_reliable(result) or stage == 3:
                return AdaptiveClassificationOutcome(result=result, email=current, stage=stage)
            previous_result = result

        raise AssertionError("adaptive classification exhausted without a final result")

    def _is_reliable(self, result: ClassificationResult) -> bool:
        return (
            result.confidence >= self._config.confidence_threshold
            and not result.needs_more_context
            and not result.review_required
        )
