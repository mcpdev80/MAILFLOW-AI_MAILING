from mailflow_core.exceptions import LLMError
from mailflow_core.resilience import CircuitOpenError

from app.services.backfill_error_policy import (
    is_context_overflow_error,
    is_recoverable_persisted_failure,
)
from app.services.bulk_backfill import _is_transient_inference_error
from app.services.bulk_preview import _context_overflow_review_result


def test_timeout_and_open_circuit_are_transient_backfill_errors():
    assert _is_transient_inference_error(
        CircuitOpenError("classification path fast circuit is open")
    )
    assert _is_transient_inference_error(
        LLMError("litellm.Timeout: APITimeoutError - Request timed out")
    )


def test_non_timeout_llm_error_remains_a_message_failure():
    assert not _is_transient_inference_error(LLMError("invalid classification JSON"))
    assert not _is_transient_inference_error(ValueError("bad message data"))


def test_context_overflow_is_detected_but_not_treated_as_transient_wait():
    error = LLMError(
        "litellm.InternalServerError: OpenAIException - Context size has been exceeded."
    )
    assert is_context_overflow_error(error)
    assert not _is_transient_inference_error(error)


def test_old_transient_and_context_failures_are_recoverable():
    assert is_recoverable_persisted_failure(
        "classification path fast circuit is open"
    )
    assert is_recoverable_persisted_failure(
        "litellm.Timeout: APITimeoutError - Request timed out"
    )
    assert is_recoverable_persisted_failure(
        "OpenAIException - Context size has been exceeded."
    )
    assert not is_recoverable_persisted_failure("invalid classification JSON")


def test_terminal_context_overflow_becomes_manual_review_not_failure():
    result = _context_overflow_review_result()
    assert result.method == "fallback"
    assert result.review_required is True
    assert result.confidence == 0.0
    assert result.reason == "context_window_exceeded; manual review required"
