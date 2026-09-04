"""Tests for separate fast/deep classification model paths."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

from mailflow_core.classification.llm_client import LLMClient, LLMConfig
from mailflow_core.types import ClassificationResult, ParsedEmail


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
