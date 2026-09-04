"""LLM semantic classification parsing tests."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from mailflow_core.classification.llm_client import LLMClient, LLMConfig
from mailflow_core.exceptions import ClassificationError
from mailflow_core.types import ParsedEmail


def _email() -> ParsedEmail:
    return ParsedEmail(
        uid=1,
        subject_normalized="Invoice overdue",
        body_text="Please pay this invoice today.",
        body_html="",
        signature="",
        from_email="billing@example.com",
        from_domain="example.com",
    )


def _completion(payload: dict) -> MagicMock:
    response = MagicMock()
    response.choices[0].message.content = json.dumps(payload)
    return response


def test_full_semantic_response_is_parsed() -> None:
    client = LLMClient(LLMConfig(model_id="test-model"))
    payload = {
        "category": "finance",
        "subcategory": "invoice",
        "importance": "high",
        "urgency": "today",
        "action_required": "yes",
        "system_tags": ["follow_up"],
        "user_tags": ["customer-a"],
        "confidence": 0.91,
        "needs_more_context": False,
        "review_required": False,
    }
    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        completion.return_value = _completion(payload)
        result = client.classify(_email())

    assert result.category == "finance"
    assert result.subcategory == "invoice"
    assert result.label == "finance"
    assert result.importance == "high"
    assert result.urgency == "today"
    assert result.action_required == "yes"
    assert result.system_tags == ("follow_up", "today", "action_required")
    assert result.user_tags == ("customer-a",)
    assert result.review_required is False


def test_other_category_can_suggest_unconfirmed_category() -> None:
    client = LLMClient(LLMConfig(model_id="test-model"))
    payload = {
        "category": "other",
        "suggested_category": "travel",
        "suggested_subcategory": "flight-change",
        "importance": "normal",
        "urgency": "today",
        "action_required": "yes",
        "confidence": 0.82,
        "needs_more_context": False,
        "review_required": False,
    }
    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        completion.return_value = _completion(payload)
        result = client.classify(_email())

    assert result.category == "other"
    assert result.suggested_category == "travel"
    assert result.suggested_subcategory == "flight-change"


def test_unconfirmed_category_is_rejected() -> None:
    client = LLMClient(LLMConfig(model_id="test-model"))
    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        completion.return_value = _completion(
            {
                "category": "travel",
                "importance": "normal",
                "urgency": "none",
                "action_required": "no",
                "confidence": 0.9,
            }
        )
        with pytest.raises(ClassificationError, match="confirmed categories"):
            client.classify(_email())


def test_low_confidence_is_marked_for_review() -> None:
    client = LLMClient(LLMConfig(model_id="test-model", review_confidence_threshold=0.7))
    payload = {
        "category": "work",
        "importance": "normal",
        "urgency": "none",
        "action_required": "no",
        "confidence": 0.65,
        "needs_more_context": False,
        "review_required": False,
    }
    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        completion.return_value = _completion(payload)
        result = client.classify(_email())

    assert result.review_required is True
    assert result.reason == "classification requires review"
