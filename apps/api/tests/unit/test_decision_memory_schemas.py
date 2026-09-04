"""Validation tests for explicit DecisionMemory writes."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.decision_memory_schemas import DecisionMemoryWrite


def _payload() -> dict[str, object]:
    return {
        "sender_email": "billing@example.com",
        "category": "finance",
        "importance": "normal",
        "urgency": "none",
        "action_required": "no",
    }


def test_human_confirmed_entry_is_valid() -> None:
    payload = DecisionMemoryWrite(**_payload())
    assert payload.source == "human_confirmed"
    assert payload.trust_score == 1.0


def test_ai_observed_cannot_be_created_through_user_api() -> None:
    with pytest.raises(ValidationError):
        DecisionMemoryWrite(**_payload(), source="ai_observed")


def test_match_identity_is_required() -> None:
    payload = _payload()
    payload.pop("sender_email")
    with pytest.raises(ValidationError):
        DecisionMemoryWrite(**payload)
