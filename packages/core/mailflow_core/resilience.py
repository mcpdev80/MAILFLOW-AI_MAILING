"""Resilience helpers: bounded retries and observable circuit breakers.

Framework-agnostic so worker/API code can reuse the same behavior for unstable
external dependencies such as IMAP and LLM endpoints.
"""

from __future__ import annotations

import asyncio
import functools
import random
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from mailflow_core.exceptions import MailFlowError


class CircuitOpenError(MailFlowError):
    """Raised when an open circuit rejects a call without executing it."""


@dataclass(frozen=True)
class CircuitHealth:
    """Compact, content-free circuit state suitable for metrics/API exposure."""

    state: str
    failure_count: int
    last_success_at: float | None
    last_failure_at: float | None
    last_error_type: str | None
    opened_at: float | None

    @property
    def degraded(self) -> bool:
        return self.state != "closed" or self.failure_count > 0


@dataclass
class RetryPolicy:
    """Exponential backoff with bounded attempts and optional jitter."""

    max_attempts: int = 3
    base_delay: float = 0.5
    max_delay: float = 30.0
    factor: float = 2.0
    jitter: float = 0.1

    def __post_init__(self) -> None:
        if self.max_attempts <= 0:
            raise ValueError("max_attempts must be positive")
        if self.base_delay < 0 or self.max_delay < 0:
            raise ValueError("retry delays must not be negative")
        if self.factor < 1:
            raise ValueError("factor must be at least 1")
        if self.jitter < 0:
            raise ValueError("jitter must not be negative")

    def delay_for(self, attempt: int) -> float:
        """Delay before a retry after the 1-indexed failed attempt."""
        if attempt <= 0:
            raise ValueError("attempt must be positive")
        raw = self.base_delay * (self.factor ** (attempt - 1))
        capped = min(raw, self.max_delay)
        return capped + random.random() * self.jitter * capped


async def retry_with_backoff[T](
    operation: Callable[[], Awaitable[T]],
    *,
    policy: RetryPolicy | None = None,
    retry_on: tuple[type[BaseException], ...] = (Exception,),
    on_retry: Callable[[int, BaseException], None] | None = None,
    sleep: Callable[[float], Awaitable[None]] | None = None,
) -> T:
    """Execute ``operation`` with bounded exponential-backoff retries."""
    pol = policy or RetryPolicy()
    if sleep is None:
        sleep = asyncio.sleep

    last_exc: BaseException | None = None
    for attempt in range(1, pol.max_attempts + 1):
        try:
            return await operation()
        except retry_on as exc:
            last_exc = exc
            if attempt >= pol.max_attempts:
                break
            if on_retry is not None:
                on_retry(attempt, exc)
            await sleep(pol.delay_for(attempt))
    assert last_exc is not None  # noqa: S101 - loop failed at least once
    raise last_exc


@dataclass
class CircuitBreaker:
    """Observable closed -> open -> half-open circuit breaker.

    ``state`` changes to ``half-open`` after ``reset_timeout``. Exactly one
    caller is not enforced here; callers that need strict distributed probe
    serialization should wrap this primitive at the scheduler/service layer.
    """

    failure_threshold: int = 5
    reset_timeout: float = 60.0
    _failures: int = field(default=0, init=False)
    _opened_at: float | None = field(default=None, init=False)
    _last_success_at: float | None = field(default=None, init=False)
    _last_failure_at: float | None = field(default=None, init=False)
    _last_error_type: str | None = field(default=None, init=False)
    _time: Callable[[], float] = field(default=time.monotonic)

    def __post_init__(self) -> None:
        if self.failure_threshold <= 0:
            raise ValueError("failure_threshold must be positive")
        if self.reset_timeout <= 0:
            raise ValueError("reset_timeout must be positive")

    @property
    def state(self) -> str:
        if self._opened_at is None:
            return "closed"
        if self._time() - self._opened_at >= self.reset_timeout:
            return "half-open"
        return "open"

    @property
    def failure_count(self) -> int:
        return self._failures

    def health(self) -> CircuitHealth:
        """Return a compact snapshot without request payloads or secrets."""
        return CircuitHealth(
            state=self.state,
            failure_count=self._failures,
            last_success_at=self._last_success_at,
            last_failure_at=self._last_failure_at,
            last_error_type=self._last_error_type,
            opened_at=self._opened_at,
        )

    def record_success(self) -> None:
        """Record recovery/success when the protected operation validates."""
        self._failures = 0
        self._opened_at = None
        self._last_success_at = self._time()
        self._last_error_type = None

    def record_failure(self, exc: BaseException) -> None:
        """Record a failed or semantically invalid protected operation."""
        self._failures += 1
        self._last_failure_at = self._time()
        self._last_error_type = type(exc).__name__
        if self._failures >= self.failure_threshold:
            self._opened_at = self._last_failure_at

    async def call[T](self, operation: Callable[[], Awaitable[T]]) -> T:
        """Execute ``operation`` while respecting the circuit state."""
        if self.state == "open":
            raise CircuitOpenError(f"Circuit open ({self._failures} failures); rejecting call")
        try:
            result = await operation()
        except Exception as exc:
            self.record_failure(exc)
            raise
        else:
            self.record_success()
            return result


def with_retry[T](
    *,
    policy: RetryPolicy | None = None,
    retry_on: tuple[type[BaseException], ...] = (Exception,),
) -> Callable[[Callable[..., Awaitable[T]]], Callable[..., Awaitable[T]]]:
    """Decorator applying :func:`retry_with_backoff` to an async callable."""

    def decorator(func: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
        @functools.wraps(func)
        async def wrapper(*args: object, **kwargs: object) -> T:
            return await retry_with_backoff(
                lambda: func(*args, **kwargs), policy=policy, retry_on=retry_on
            )

        return wrapper

    return decorator
