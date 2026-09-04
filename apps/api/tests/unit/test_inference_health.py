"""Tests for content-free inference health publication."""

from __future__ import annotations

import asyncio
import json
from uuid import uuid4

from app.inference_health import (
    build_inference_health_payload,
    inference_health_key,
    publish_inference_health,
)


class _FakeRedis:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, int | None]] = []

    async def set(self, key: str, value: str, *, ex: int | None = None) -> None:
        self.calls.append((key, value, ex))


def test_payload_is_degraded_when_any_model_path_is_degraded() -> None:
    account_id = uuid4()
    payload = build_inference_health_payload(
        account_id,
        {
            "fast": {
                "role": "fast",
                "model_id": "fast-model",
                "state": "open",
                "failure_count": 3,
                "degraded": True,
            },
            "deep": {
                "role": "deep",
                "model_id": "deep-model",
                "state": "closed",
                "failure_count": 0,
                "degraded": False,
            },
        },
    )

    assert payload["account_id"] == str(account_id)
    assert payload["status"] == "degraded"
    assert payload["degraded"] is True
    assert payload["updated_at"]


def test_payload_is_ok_when_all_paths_are_healthy() -> None:
    payload = build_inference_health_payload(
        "account-1",
        {
            "fast": {"degraded": False},
            "deep": {"degraded": False},
            "generation": {"degraded": False},
        },
    )
    assert payload["status"] == "ok"
    assert payload["degraded"] is False


def test_publish_uses_mailbox_scoped_key_and_ttl(monkeypatch) -> None:
    from app import inference_health

    account_id = uuid4()
    fake = _FakeRedis()
    monkeypatch.setattr(inference_health.settings, "LLM_HEALTH_TTL_SECONDS", 123)

    payload = asyncio.run(
        publish_inference_health(
            fake,  # type: ignore[arg-type]
            account_id,
            {
                "fast": {
                    "role": "fast",
                    "model_id": "fast-model",
                    "api_base": "http://model.local/v1",
                    "state": "closed",
                    "failure_count": 0,
                    "last_error_type": None,
                    "fallback_count": 0,
                    "degraded": False,
                }
            },
        )
    )

    assert len(fake.calls) == 1
    key, raw, ttl = fake.calls[0]
    assert key == inference_health_key(account_id)
    assert ttl == 123
    assert json.loads(raw) == payload
    assert "api_key" not in raw
    assert "body" not in raw
