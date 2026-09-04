"""Compact thread-summary model-call tests."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

from mailflow_core.classification.llm_client import LLMClient, LLMConfig
from mailflow_core.types import ClassificationResult, ParsedEmail


def email() -> ParsedEmail:
    return ParsedEmail(
        uid=1,
        subject_normalized="Invoice 4711",
        body_text="Payment was sent today. Nothing else is required.",
        body_html="",
        signature="",
        from_email="customer@example.com",
        from_domain="example.com",
        to_emails=["accounts@company.com"],
        message_id="<new@example.com>",
        in_reply_to="<old@example.com>",
        references=("<root@example.com>", "<old@example.com>"),
    )


def result() -> ClassificationResult:
    return ClassificationResult(
        label="finance",
        category="finance",
        importance="normal",
        urgency="none",
        action_required="no",
        confidence=0.94,
        method="llm",
    )


def completion(payload: dict) -> MagicMock:
    response = MagicMock()
    response.choices[0].message.content = json.dumps(payload)
    return response


def test_summary_update_uses_previous_summary_and_current_message_only():
    client = LLMClient(LLMConfig(model_id="test-model"))
    previous = "Invoice 4711 is awaiting payment from the customer."
    with patch("mailflow_core.classification.llm_client.litellm.completion") as call:
        call.return_value = completion(
            {
                "changed": True,
                "summary": "Invoice 4711 has been paid; no action remains.",
                "open_action_required": False,
                "deadline": None,
            }
        )
        update = client.update_thread_summary(previous, email(), result())

    prompt = call.call_args.kwargs["messages"][1]["content"]
    assert previous in prompt
    assert "Payment was sent today" in prompt
    assert "full thread history" not in prompt.lower()
    assert update.changed is True
    assert update.open_action_required is False
    assert update.summary == "Invoice 4711 has been paid; no action remains."


def test_irrelevant_message_keeps_existing_summary():
    client = LLMClient(LLMConfig(model_id="test-model"))
    previous = "Project is waiting for Alice's approval."
    with patch("mailflow_core.classification.llm_client.litellm.completion") as call:
        call.return_value = completion(
            {
                "changed": False,
                "summary": "Model attempted a replacement",
                "open_action_required": True,
                "deadline": "Friday",
            }
        )
        update = client.update_thread_summary(previous, email(), result())

    assert update.changed is False
    assert update.summary == previous
    assert update.open_action_required is True
    assert update.deadline == "Friday"
