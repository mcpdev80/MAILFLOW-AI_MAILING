"""Tests para mailflow_core.resilience — retry con backoff y circuit breaker.

Los tests son síncronos y usan asyncio.run() para no depender de pytest-asyncio
en el paquete core (su config de pytest no activa asyncio_mode).
"""

from __future__ import annotations

import asyncio

import pytest

from mailflow_core.resilience import (
    CircuitBreaker,
    CircuitOpenError,
    RetryPolicy,
    retry_with_backoff,
)


async def _noop_sleep(_seconds: float) -> None:
    return None


def run(coro):
    return asyncio.run(coro)


class TestRetryPolicy:
    def test_delay_grows_exponentially(self):
        pol = RetryPolicy(base_delay=1.0, factor=2.0, jitter=0.0, max_delay=100)
        assert pol.delay_for(1) == 1.0
        assert pol.delay_for(2) == 2.0
        assert pol.delay_for(3) == 4.0

    def test_delay_capped_at_max(self):
        pol = RetryPolicy(base_delay=10, factor=10, jitter=0.0, max_delay=15)
        assert pol.delay_for(3) == 15

    def test_rejects_invalid_policy_values(self):
        with pytest.raises(ValueError):
            RetryPolicy(max_attempts=0)
        with pytest.raises(ValueError):
            RetryPolicy(base_delay=-1)
        with pytest.raises(ValueError):
            RetryPolicy(factor=0.5)


class TestRetryWithBackoff:
    def test_returns_immediately_on_success(self):
        calls = {"n": 0}

        async def op():
            calls["n"] += 1
            return "ok"

        assert run(retry_with_backoff(op, sleep=_noop_sleep)) == "ok"
        assert calls["n"] == 1

    def test_retries_then_succeeds(self):
        calls = {"n": 0}

        async def op():
            calls["n"] += 1
            if calls["n"] < 3:
                raise ValueError("transient")
            return "recovered"

        result = run(retry_with_backoff(op, policy=RetryPolicy(max_attempts=3), sleep=_noop_sleep))
        assert result == "recovered"
        assert calls["n"] == 3

    def test_raises_last_exception_after_exhausting(self):
        calls = {"n": 0}

        async def op():
            calls["n"] += 1
            raise ValueError(f"fail-{calls['n']}")

        with pytest.raises(ValueError, match="fail-3"):
            run(retry_with_backoff(op, policy=RetryPolicy(max_attempts=3), sleep=_noop_sleep))
        assert calls["n"] == 3

    def test_does_not_retry_unlisted_exceptions(self):
        calls = {"n": 0}

        async def op():
            calls["n"] += 1
            raise KeyError("not retryable")

        with pytest.raises(KeyError):
            run(retry_with_backoff(op, retry_on=(ValueError,), sleep=_noop_sleep))
        assert calls["n"] == 1

    def test_on_retry_callback_invoked(self):
        seen: list[int] = []

        async def op():
            raise ValueError("x")

        with pytest.raises(ValueError):
            run(
                retry_with_backoff(
                    op,
                    policy=RetryPolicy(max_attempts=3),
                    on_retry=lambda attempt, _exc: seen.append(attempt),
                    sleep=_noop_sleep,
                )
            )
        assert seen == [1, 2]


class TestCircuitBreaker:
    def test_opens_after_threshold_failures(self):
        clock = {"t": 0.0}
        cb = CircuitBreaker(failure_threshold=2, reset_timeout=10, _time=lambda: clock["t"])

        async def failing():
            raise ValueError("boom")

        for _ in range(2):
            with pytest.raises(ValueError):
                run(cb.call(failing))
        assert cb.state == "open"
        health = cb.health()
        assert health.state == "open"
        assert health.failure_count == 2
        assert health.last_error_type == "ValueError"
        assert health.degraded is True

        async def should_not_run():
            raise AssertionError("must not be called")

        with pytest.raises(CircuitOpenError):
            run(cb.call(should_not_run))

    def test_half_open_after_timeout_then_closes_on_success(self):
        clock = {"t": 0.0}
        cb = CircuitBreaker(failure_threshold=1, reset_timeout=5, _time=lambda: clock["t"])

        async def failing():
            raise ValueError("boom")

        with pytest.raises(ValueError):
            run(cb.call(failing))
        assert cb.state == "open"

        clock["t"] = 6.0
        assert cb.state == "half-open"
        assert cb.health().degraded is True

        async def ok():
            return "ok"

        assert run(cb.call(ok)) == "ok"
        assert cb.state == "closed"
        health = cb.health()
        assert health.failure_count == 0
        assert health.last_success_at == 6.0
        assert health.last_error_type is None
        assert health.degraded is False

    def test_success_resets_failure_count(self):
        cb = CircuitBreaker(failure_threshold=3)

        async def failing():
            raise ValueError("boom")

        async def ok():
            return 1

        with pytest.raises(ValueError):
            run(cb.call(failing))
        run(cb.call(ok))
        with pytest.raises(ValueError):
            run(cb.call(failing))
        assert cb.state == "closed"
        assert cb.failure_count == 1

    def test_manual_recording_tracks_semantic_failures(self):
        clock = {"t": 10.0}
        cb = CircuitBreaker(failure_threshold=1, reset_timeout=30, _time=lambda: clock["t"])
        cb.record_failure(ValueError("invalid schema"))
        health = cb.health()
        assert health.state == "open"
        assert health.last_failure_at == 10.0
        assert health.last_error_type == "ValueError"

        clock["t"] = 41.0
        assert cb.state == "half-open"
        cb.record_success()
        assert cb.health().state == "closed"
