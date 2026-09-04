from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas import EmailAccountUpdate


def test_action_policy_update_accepts_supported_modes() -> None:
    payload = EmailAccountUpdate(
        move_policy="automatic",
        archive_policy="review",
        action_confidence_threshold=0.91,
    )

    assert payload.move_policy == "automatic"
    assert payload.archive_policy == "review"
    assert payload.action_confidence_threshold == 0.91


def test_action_policy_update_rejects_invalid_mode() -> None:
    with pytest.raises(ValidationError):
        EmailAccountUpdate(move_policy="always")  # type: ignore[arg-type]


def test_action_policy_update_rejects_invalid_threshold() -> None:
    with pytest.raises(ValidationError):
        EmailAccountUpdate(action_confidence_threshold=1.01)
