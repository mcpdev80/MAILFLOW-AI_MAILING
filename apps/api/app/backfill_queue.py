"""Queue helpers that keep historical backfill bounded to one batch at a time."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4


def backfill_batch_job_id(
    job_id: UUID | str,
    cursor_uid: int | None,
    *,
    unique_retry: bool = False,
) -> str:
    position = "start" if cursor_uid is None else str(cursor_uid)
    base = f"backfill-{job_id}-{position}"
    if unique_retry:
        return f"{base}-{uuid4().hex[:10]}"
    return base


async def enqueue_backfill_batch(
    redis: Any,
    *,
    job_id: UUID | str,
    cursor_uid: int | None,
    defer_seconds: float = 0.0,
    unique_retry: bool = False,
) -> bool:
    """Enqueue exactly one bounded batch; callers requeue only after checkpointing.

    Normal next-cursor jobs use a deterministic id for deduplication. A retry at
    the same cursor needs a fresh id because ARQ may retain the currently running
    job key until its result TTL expires.
    """
    kwargs: dict[str, object] = {
        "_job_id": backfill_batch_job_id(
            job_id,
            cursor_uid,
            unique_retry=unique_retry,
        ),
    }
    if defer_seconds > 0:
        kwargs["_defer_by"] = defer_seconds
    queued = await redis.enqueue_job(
        "process_backfill_batch",
        str(job_id),
        **kwargs,
    )
    return queued is not None


async def enqueue_backfill_failure_retry(
    redis: Any,
    *,
    job_id: UUID | str,
    failure_id: UUID | str,
    defer_seconds: float = 0.0,
) -> bool:
    """Queue one explicit retry without restarting or rewinding the whole job."""
    kwargs: dict[str, object] = {
        "_job_id": f"backfill-retry-{failure_id}-{uuid4().hex[:10]}"
    }
    if defer_seconds > 0:
        kwargs["_defer_by"] = defer_seconds
    queued = await redis.enqueue_job(
        "process_backfill_failure",
        str(job_id),
        str(failure_id),
        **kwargs,
    )
    return queued is not None
