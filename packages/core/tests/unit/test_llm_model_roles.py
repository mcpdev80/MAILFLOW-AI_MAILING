"""Tests for separate fast/deep classification model paths and resilience."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from mailflow_core.classification.llm_client import (
    LLMClient,
    LLMConfig,
    reset_model_path_health,
)
from mailflow_core.exceptions import LLMError
from mailflow_core.resilience import CircuitOpenError
from mailflow_core.types import ClassificationResult, DraftRequest, ParsedEmail


@pytest.fixture(autouse=True)
def _reset_health() -> None:
    reset_model_path_health()


def _email() -> ParsedEmail:
    return ParsedEmail(
        uid=1,
        subject_normalized="Invoice question",
        body_text="Please confirm the invoice total.",
        body_html="",
        signature="",
        from_email="billing@example.com",
        from_domain="example.com",
    )


def _response(*, include_summary: bool = False) -> MagicMock:
    payload: dict[str, object] = {
        "category": "finance",
        "importance": "normal",
        "urgency": "none",
        "action_required": "no",
        "confidence": 0.94,
        "needs_more_context": False,
        "review_required": False,
        "suspicious_content": False,
    }
    if include_summary:
        payload["thread_summary_update"] = {
            "changed": True,
            "summary": "Invoice total is being confirmed.",
            "open_action_required": True,
            "deadline": None,
        }
    response = MagicMock()
    response.choices[0].message.content = json.dumps(payload)
    return response


def _raw_response(content: str) -> MagicMock:
    response = MagicMock()
    response.choices[0].message.content = content
    return response


def test_stage_zero_uses_fast_and_stage_two_uses_deep() -> None:
    client = LLMClient(
        LLMConfig(
            model_id="legacy",
            fast_model_id="fast-model",
            deep_model_id="deep-model",
        )
    )

    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        completion.return_value = _response()
        fast = client.classify(_email(), classification_stage=0)
        deep = client.classify(_email(), classification_stage=2)

    assert completion.call_args_list[0].kwargs["model"] == "fast-model"
    assert completion.call_args_list[1].kwargs["model"] == "deep-model"
    assert fast.classification_model == "fast-model"
    assert deep.classification_model == "deep-model"


def test_deep_failure_falls_back_to_fast_without_generation_path() -> None:
    client = LLMClient(
        LLMConfig(
            model_id="legacy",
            fast_model_id="fast-model",
            deep_model_id="deep-model",
            max_retries=0,
        )
    )

    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        completion.side_effect = [RuntimeError("deep unavailable"), _response()]
        result = client.classify(_email(), classification_stage=3)

    assert [call.kwargs["model"] for call in completion.call_args_list] == [
        "deep-model",
        "fast-model",
    ]
    assert result.classification_model == "fast-model"
    health = client.health_snapshot()
    assert health["deep"].circuit.failure_count == 1
    assert health["fast"].fallback_count == 1


def test_invalid_primary_output_is_failure_and_falls_back() -> None:
    client = LLMClient(
        LLMConfig(
            model_id="legacy",
            fast_model_id="fast-model",
            deep_model_id="deep-model",
            max_retries=0,
        )
    )

    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        completion.side_effect = [_raw_response("not-json"), _response()]
        result = client.classify(_email(), classification_stage=0)

    assert [call.kwargs["model"] for call in completion.call_args_list] == [
        "fast-model",
        "deep-model",
    ]
    assert result.classification_model == "deep-model"
    health = client.health_snapshot()
    assert health["fast"].circuit.failure_count == 1
    assert health["fast"].circuit.last_error_type == "ClassificationError"
    assert health["deep"].fallback_count == 1


def test_circuit_state_survives_new_client_instance() -> None:
    config = LLMConfig(
        model_id="legacy",
        fast_model_id="fast-model",
        deep_model_id="deep-model",
        max_retries=0,
        path_failure_threshold=1,
        path_reset_timeout=300,
    )
    first = LLMClient(config)

    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        completion.side_effect = [RuntimeError("fast down"), _response()]
        first.classify(_email(), classification_stage=0)

    second = LLMClient(config)
    assert second.health_snapshot()["fast"].circuit.state == "open"

    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        completion.return_value = _response()
        result = second.classify(_email(), classification_stage=0)

    # Fast is skipped while its circuit is open; deep handles the request.
    assert completion.call_count == 1
    assert completion.call_args.kwargs["model"] == "deep-model"
    assert result.classification_model == "deep-model"


def test_role_specific_timeout_and_retry_settings_are_applied() -> None:
    client = LLMClient(
        LLMConfig(
            model_id="legacy",
            fast_model_id="fast-model",
            deep_model_id="deep-model",
            timeout=30,
            max_retries=2,
            fast_timeout=5,
            fast_max_retries=0,
            deep_timeout=45,
            deep_max_retries=1,
        )
    )

    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        completion.return_value = _response()
        client.classify(_email(), classification_stage=0)
        client.classify(_email(), classification_stage=2)

    assert completion.call_args_list[0].kwargs["timeout"] == 5
    assert completion.call_args_list[0].kwargs["num_retries"] == 0
    assert completion.call_args_list[1].kwargs["timeout"] == 45
    assert completion.call_args_list[1].kwargs["num_retries"] == 1


def test_generation_has_independent_circuit() -> None:
    client = LLMClient(
        LLMConfig(
            model_id="generation-model",
            max_retries=0,
            path_failure_threshold=1,
            path_reset_timeout=300,
        )
    )
    request = DraftRequest(
        classification=ClassificationResult(
            label="finance",
            category="finance",
            confidence=0.99,
            method="llm",
        ),
        subject="Re: Invoice question",
    )

    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        completion.side_effect = RuntimeError("generation down")
        with pytest.raises(LLMError):
            client.generate_draft(_email(), request)

    assert client.health_snapshot()["generation"].circuit.state == "open"

    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        with pytest.raises(CircuitOpenError):
            client.generate_draft(_email(), request)
        completion.assert_not_called()


def test_single_classification_model_remains_compatible() -> None:
    client = LLMClient(LLMConfig(model_id="legacy-only"))

    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        completion.return_value = _response()
        result = client.classify(_email(), classification_stage=0)

    assert completion.call_args.kwargs["model"] == "legacy-only"
    assert result.classification_model == "legacy-only"


def test_deep_result_can_reuse_thread_summary_without_second_call() -> None:
    client = LLMClient(
        LLMConfig(
            model_id="legacy",
            fast_model_id="fast-model",
            deep_model_id="deep-model",
        )
    )

    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        completion.return_value = _response(include_summary=True)
        result = client.classify(
            _email(),
            classification_stage=2,
            thread_summary="Customer asked about the invoice.",
        )
        update = client.update_thread_summary(
            "Customer asked about the invoice.",
            _email(),
            result,
        )

    assert completion.call_count == 1
    assert update.summary == "Invoice total is being confirmed."
    assert update.open_action_required is True


def test_custom_stage_mapping_is_respected() -> None:
    client = LLMClient(
        LLMConfig(
            model_id="legacy",
            fast_model_id="fast-model",
            deep_model_id="deep-model",
            stage_roles=("deep", "fast", "fast", "deep"),
        )
    )

    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        completion.return_value = _response()
        result = client.classify(_email(), classification_stage=0)

    assert completion.call_args.kwargs["model"] == "deep-model"
    assert result.classification_model == "deep-model"


def test_decision_memory_result_can_leave_model_unset() -> None:
    remembered = ClassificationResult(
        label="finance",
        category="finance",
        importance="normal",
        urgency="none",
        action_required="no",
        confidence=0.99,
        method="decision_memory",
    )
    assert remembered.classification_model is None
