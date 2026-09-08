from mailflow_core.exceptions import LLMError
from mailflow_core.resilience import CircuitOpenError

from app.services.bulk_backfill import _is_transient_inference_error


def test_timeout_and_open_circuit_are_transient_backfill_errors():
    assert _is_transient_inference_error(CircuitOpenError("classification path fast circuit is open"))
    assert _is_transient_inference_error(
        LLMError("litellm.Timeout: APITimeoutError - Request timed out")
    )


def test_non_timeout_llm_error_remains_a_message_failure():
    assert not _is_transient_inference_error(LLMError("invalid classification JSON"))
    assert not _is_transient_inference_error(ValueError("bad message data"))
