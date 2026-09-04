"""Queue semantics for bounded historical backfill."""

from __future__ import annotations

import asyncio
from uuid import uuid4

from app.backfill_queue import (
    backfill_batch_job_id,
    enqueue_backfill_batch,
    enqueue_backfill_failure_retry,
)


class _FakeRedis:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[object, ...], dict[str, object]]] = []

    async def enqueue_job(self, function: str, *args: object, **kwargs: object):
        self.calls.append((function, args, kwargs))
        return object()


def test_normal_cursor_job_id_is_deterministic() -> None:
    job_id = uuid4()
    assert backfill_batch_job_id(job_id, 123) == f"backfill-{job_id}-123"
    assert backfill_batch_job_id(job_id, None) == f"backfill-{job_id}-start"


def test_same_cursor_retry_gets_fresh_job_id() -> None:
    job_id = uuid4()
    first = backfill_batch_job_id(job_id, 123, unique_retry=True)
    second = backfill_batch_job_id(job_id, 123, unique_retry=True)
    assert first.startswith(f"backfill-{job_id}-123-")
    assert second.startswith(f"backfill-{job_id}-123-")
    assert first != second


def test_enqueue_creates_exactly_one_bounded_batch_job() -> None:
    redis = _FakeRedis()
    job_id = uuid4()
    queued = asyncio.run(
        enqueue_backfill_batch(
            redis,
            job_id=job_id,
            cursor_uid=25,
            defer_seconds=1.0,
        )
    )
    assert queued is True
    assert len(redis.calls) == 1
    function, args, kwargs = redis.calls[0]
    assert function == "process_backfill_batch"
    assert args == (str(job_id),)
    assert kwargs["_job_id"] == f"backfill-{job_id}-25"
    assert kwargs["_defer_by"] == 1.0


def test_targeted_failure_retry_does_not_restart_whole_job() -> None:
    redis = _FakeRedis()
    job_id = uuid4()
    failure_id = uuid4()
    queued = asyncio.run(
        enqueue_backfill_failure_retry(
            redis,
            job_id=job_id,
            failure_id=failure_id,
            defer_seconds=60,
        )
    )
    assert queued is True
    assert len(redis.calls) == 1
    function, args, kwargs = redis.calls[0]
    assert function == "process_backfill_failure"
    assert args == (str(job_id), str(failure_id))
    assert str(failure_id) in str(kwargs["_job_id"])
    assert kwargs["_defer_by"] == 60
