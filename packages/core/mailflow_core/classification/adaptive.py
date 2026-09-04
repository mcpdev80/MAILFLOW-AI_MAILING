"""Adaptive multi-stage classification orchestration.

The classifier starts with headers only and requests progressively more cleaned body
content only when the previous result is not reliable enough. Attachment content is an
optional final escalation and is never loaded on the normal fast path unless a strong
attachment signal is present.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, replace
from typing import Protocol

from mailflow_core.attachments import (
    AttachmentExtractionConfig,
    ExtractedAttachment,
    is_high_signal_attachment,
    is_supported_attachment,
    should_inspect_attachments,
)
from mailflow_core.decision_memory import DecisionMemoryMatch, result_for_direct_reuse
from mailflow_core.mail_auth import auth_signals_block_memory_reuse
from mailflow_core.types import ClassificationResult, ParsedEmail

BodyLoader = Callable[[int | None], ParsedEmail]
AttachmentLoader = Callable[[ParsedEmail], tuple[ExtractedAttachment, ...]]
_ATTACHMENT_MARKER = "BEGIN_UNTRUSTED_ATTACHMENT_CONTEXT"


class DecisionMemoryLookup(Protocol):
    """Minimal lookup boundary implemented by persistent DecisionMemory."""

    def lookup(
        self,
        email: ParsedEmail,
        thread_summary: str | None,
    ) -> DecisionMemoryMatch | None: ...


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
        attachment_loader: AttachmentLoader | None = None,
    ) -> AdaptiveClassificationOutcome:
        memory_match: DecisionMemoryMatch | None = None
        if self._memory is not None and not auth_signals_block_memory_reuse(
            headers_only.auth_signals
        ):
            memory_match = self._memory.lookup(headers_only, thread_summary)
            if (
                memory_match is not None
                and memory_match.can_bypass
                and self._is_reliable(memory_match.result)
            ):
                return AdaptiveClassificationOutcome(
                    result=result_for_direct_reuse(memory_match),
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
        previous_result: ClassificationResult | None = (
            memory_match.result if memory_match is not None else None
        )
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
            result = self._annotate_memory_hint(result, memory_match)

            if _ATTACHMENT_MARKER in current.body_text:
                default_attachment_config = AttachmentExtractionConfig()
                used_types = tuple(
                    dict.fromkeys(
                        item.mime_type
                        for item in current.attachments
                        if is_supported_attachment(item, default_attachment_config)
                    )
                )
                result = replace(
                    result,
                    attachment_context_used=True,
                    attachment_types_used=used_types,
                    attachment_extraction_status="used",
                )
                return AdaptiveClassificationOutcome(result=result, email=current, stage=stage)

            reliable = self._is_reliable(result)
            strong_attachment_signal = any(
                is_high_signal_attachment(item) for item in current.attachments
            )
            if reliable and not strong_attachment_signal:
                return AdaptiveClassificationOutcome(result=result, email=current, stage=stage)

            if attachment_loader is not None and should_inspect_attachments(
                confidence=result.confidence,
                confidence_threshold=self._config.confidence_threshold,
                needs_more_context=result.needs_more_context,
                body_text=current.body_text,
                attachments=current.attachments,
            ):
                extracted = attachment_loader(current)
                used = tuple(item for item in extracted if item.status == "used" and item.text)
                if used:
                    attachment_text = "\n\n".join(item.prompt_block() for item in used)
                    attachment_email = replace(
                        current,
                        body_text=(f"{current.body_text}\n\n" if current.body_text else "")
                        + "BEGIN_UNTRUSTED_ATTACHMENT_CONTEXT\n"
                        + attachment_text
                        + "\nEND_UNTRUSTED_ATTACHMENT_CONTEXT",
                    )
                    attachment_result = self._llm.classify(
                        attachment_email,
                        thread_summary=thread_summary,
                        supporting_signal=supporting_signal,
                        previous_result=result,
                        classification_stage=3,
                    )
                    attachment_result = replace(
                        attachment_result,
                        classification_stage=3,
                        attachment_context_used=True,
                        attachment_types_used=tuple(
                            dict.fromkeys(item.metadata.mime_type for item in used)
                        ),
                        attachment_extraction_status="used",
                    )
                    attachment_result = self._annotate_memory_hint(
                        attachment_result, memory_match
                    )
                    return AdaptiveClassificationOutcome(
                        result=attachment_result,
                        email=current,
                        stage=3,
                    )

                status = (
                    "failed" if any(item.status == "failed" for item in extracted) else "skipped"
                )
                errors = [item.error for item in extracted if item.error]
                result = replace(
                    result,
                    attachment_extraction_status=status,
                    attachment_extraction_error="; ".join(errors)[:300] or None,
                )

            if (reliable and not strong_attachment_signal) or stage == 3:
                return AdaptiveClassificationOutcome(result=result, email=current, stage=stage)
            previous_result = result

        raise AssertionError("adaptive classification exhausted without a final result")

    @staticmethod
    def _annotate_memory_hint(
        result: ClassificationResult,
        memory_match: DecisionMemoryMatch | None,
    ) -> ClassificationResult:
        if memory_match is None:
            return result
        return replace(
            result,
            decision_memory_id=memory_match.candidate.entry_id,
            decision_memory_match_confidence=memory_match.match_confidence,
            decision_memory_hint_used=True,
        )

    def _is_reliable(self, result: ClassificationResult) -> bool:
        return (
            result.confidence >= self._config.confidence_threshold
            and not result.needs_more_context
            and not result.review_required
        )
