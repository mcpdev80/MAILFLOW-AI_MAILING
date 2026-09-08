"""Failure policy for historical classification.

Backfill treats temporary model availability problems as retryable workload failures,
not defects of the individual message. Context-window overflow is deterministic for the
same prompt but recoverable by degrading to a smaller classification context.
"""

from __future__ import annotations

from mailflow_core.exceptions import LLMError
from mailflow_core.resilience import CircuitOpenError


def is_context_overflow_error(error: BaseException | str | None) -> bool:
    if error is None:
        return False
    text = str(error).lower()
    return any(
        marker in text
        for marker in (
            "context size has been exceeded",
            "maximum context length",
            "context_length_exceeded",
            "context window",
        )
    )


def is_transient_inference_error(error: BaseException | None) -> bool:
    """Return True for temporary LLM availability problems that should not fail a UID."""
    if isinstance(error, CircuitOpenError):
        return True
    if not isinstance(error, LLMError):
        return False
    text = str(error).lower()
    return any(
        marker in text
        for marker in (
            "timeout",
            "timed out",
            "apitimeouterror",
            "circuit is open",
        )
    )


def is_recoverable_persisted_failure(error_text: str | None) -> bool:
    """Recognize old persisted failures that newer code can safely retry on startup."""
    if not error_text:
        return False
    text = error_text.lower()
    return is_context_overflow_error(text) or any(
        marker in text
        for marker in (
            "timeout",
            "timed out",
            "apitimeouterror",
            "circuit is open",
        )
    )
