"""Regression tests for role-scoped model circuit state."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from mailflow_core.classification.llm_client import (
    LLMClient,
    LLMConfig,
    reset_model_path_health,
)
from mailflow_core.types import ParsedEmail


@pytest.fixture(autouse=True)
def _reset_health() -> None:
    reset_model_path_health()


def _email() -> ParsedEmail:
    return ParsedEmail(
        uid=1,
        subject_normalized="Status",
        body_text="Status update",
        body_html="",
        signature="",
        from_email="sender@example.com",
        from_domain="example.com",
    )


def _ok_response() -> MagicMock:
    response = MagicMock()
    response.choices[0].message.content = json.dumps(
        {
            "category": "notifications",
            "importance": "normal",
            "urgency": "none",
            "action_required": "no",
            "confidence": 0.95,
            "needs_more_context": False,
            "review_required": False,
            "suspicious_content": False,
        }
    )
    return response


def test_same_backend_has_separate_fast_and_deep_circuits() -> None:
    client = LLMClient(
        LLMConfig(
            model_id="shared-model",
            api_base="http://llm.local/v1",
            fast_model_id="shared-model",
            deep_model_id="shared-model",
            path_failure_threshold=1,
            path_reset_timeout=300,
            max_retries=0,
        )
    )

    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        # Fast fails. Because the physical path is identical, classification does
        # not make a duplicate fallback call to the same backend in this request.
        completion.side_effect = RuntimeError("fast failure")
        with pytest.raises(Exception):
            client.classify(_email(), classification_stage=0)

    health = client.health_snapshot()
    assert health["fast"].circuit.state == "open"
    assert health["deep"].circuit.state == "closed"
    assert health["generation"].circuit.state == "closed"


def test_open_fast_circuit_does_not_open_generation_role() -> None:
    client = LLMClient(
        LLMConfig(
            model_id="shared-model",
            api_base="http://llm.local/v1",
            fast_model_id="shared-model",
            deep_model_id="different-deep-model",
            path_failure_threshold=1,
            path_reset_timeout=300,
            max_retries=0,
        )
    )

    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        completion.side_effect = [RuntimeError("fast failure"), _ok_response()]
        result = client.classify(_email(), classification_stage=0)

    assert result.classification_model == "different-deep-model"
    health = client.health_snapshot()
    assert health["fast"].circuit.state == "open"
    assert health["deep"].circuit.state == "closed"
    assert health["generation"].circuit.state == "closed"
