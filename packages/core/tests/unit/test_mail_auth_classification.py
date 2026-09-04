"""Tests for using normalized mail authentication signals during classification."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

from mailflow_core.classification.adaptive import AdaptiveClassifier
from mailflow_core.classification.llm_client import LLMClient, LLMConfig
from mailflow_core.types import ClassificationResult, MailAuthSignals, ParsedEmail


def _email(signals: MailAuthSignals) -> ParsedEmail:
    return ParsedEmail(
        uid=1,
        subject_normalized="Account update",
        body_text="Please review the account update.",
        body_html="",
        signature="",
        from_email="sender@example.com",
        from_domain="example.com",
        auth_signals=signals,
    )


def _response() -> MagicMock:
    response = MagicMock()
    response.choices[0].message.content = json.dumps(
        {
            "category": "work",
            "importance": "normal",
            "urgency": "none",
            "action_required": "yes",
            "confidence": 0.95,
            "needs_more_context": False,
            "review_required": False,
            "suspicious_content": False,
        }
    )
    return response


def test_compact_auth_signal_is_in_stage_zero_prompt() -> None:
    client = LLMClient(LLMConfig(model_id="test-model"))
    email = _email(
        MailAuthSignals(
            spf="pass",
            dkim="pass",
            dmarc="pass",
            arc="none",
            spam_verdict="clean",
        )
    )
    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        completion.return_value = _response()
        result = client.classify(email, classification_stage=0)

    user = completion.call_args.kwargs["messages"][1]["content"]
    assert "auth: spf=pass dkim=pass dmarc=pass arc=none spam=clean" in user
    assert result.review_required is False


def test_spam_verdict_forces_suspicious_review_without_changing_category() -> None:
    client = LLMClient(LLMConfig(model_id="test-model"))
    email = _email(MailAuthSignals(spam_verdict="spam", spam_score=8.0))
    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        completion.return_value = _response()
        result = client.classify(email, classification_stage=0)

    assert result.category == "work"
    assert result.suspicious_content is True
    assert result.review_required is True
    assert result.reason == "mail authentication or spam signals require review"


def test_dmarc_failure_requires_review_without_becoming_spam() -> None:
    client = LLMClient(LLMConfig(model_id="test-model"))
    email = _email(MailAuthSignals(spf="fail", dkim="pass", dmarc="fail"))
    with patch("mailflow_core.classification.llm_client.litellm.completion") as completion:
        completion.return_value = _response()
        result = client.classify(email, classification_stage=0)

    assert result.category == "work"
    assert result.suspicious_content is False
    assert result.review_required is True


class _Memory:
    def __init__(self) -> None:
        self.calls = 0

    def lookup(self, email: ParsedEmail, thread_summary: str | None):
        self.calls += 1
        return ClassificationResult(
            label="work",
            category="work",
            confidence=0.99,
            method="decision_memory",
            importance="normal",
            urgency="none",
            action_required="no",
        )


class _Llm:
    def classify(self, *_args, **_kwargs):
        return ClassificationResult(
            label="work",
            category="work",
            confidence=0.95,
            method="llm",
            importance="normal",
            urgency="none",
            action_required="no",
        )


def test_risky_current_auth_signals_suppress_direct_memory_reuse() -> None:
    memory = _Memory()
    classifier = AdaptiveClassifier(_Llm(), decision_memory=memory)
    email = _email(MailAuthSignals(dmarc="fail"))

    outcome = classifier.classify(
        email,
        thread_summary=None,
        body_loader=lambda _limit: email,
    )

    assert memory.calls == 0
    assert outcome.decision_memory_hit is False
    assert outcome.stage == 0
