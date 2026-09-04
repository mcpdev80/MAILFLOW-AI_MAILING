"""Compact inference-health snapshots shared between worker and API."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import UUID

from arq.connections import ArqRedis, RedisSettings, create_pool

from app.config import settings

_KEY_PREFIX = "mailflow:inference-health:account:"


def inference_health_key(account_id: UUID | str) -> str:
    return f"{_KEY_PREFIX}{account_id}"


def build_inference_health_payload(
    account_id: UUID | str,
    paths: dict[str, dict[str, object]],
) -> dict[str, object]:
    degraded = any(bool(item.get("degraded")) for item in paths.values())
    return {
        "account_id": str(account_id),
        "status": "degraded" if degraded else "ok",
        "degraded": degraded,
        "updated_at": datetime.now(tz=UTC).isoformat(),
        "paths": paths,
    }


async def publish_inference_health(
    redis: ArqRedis,
    account_id: UUID | str,
    paths: dict[str, dict[str, object]],
) -> dict[str, object]:
    """Publish a content-free snapshot with a short TTL."""
    payload = build_inference_health_payload(account_id, paths)
    await redis.set(
        inference_health_key(account_id),
        json.dumps(payload, separators=(",", ":")),
        ex=settings.LLM_HEALTH_TTL_SECONDS,
    )
    return payload


async def read_inference_health(account_id: UUID | str) -> dict[str, object] | None:
    """Read the most recent worker snapshot using a short-lived Redis pool."""
    redis = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
    try:
        raw = await redis.get(inference_health_key(account_id))
    finally:
        await redis.close()
    if raw is None:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    data = json.loads(raw)
    return data if isinstance(data, dict) else None
