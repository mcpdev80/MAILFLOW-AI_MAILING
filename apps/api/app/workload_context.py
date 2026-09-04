"""Context-local workload identity propagated from worker jobs to LLM clients."""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Iterator

from app.workload import PRIORITY_LIVE


@dataclass(frozen=True)
class WorkloadContext:
    account_id: str | None
    priority: int


_current: ContextVar[WorkloadContext] = ContextVar(
    "mailflow_workload_context",
    default=WorkloadContext(account_id=None, priority=PRIORITY_LIVE),
)


def current_workload_context() -> WorkloadContext:
    return _current.get()


@contextmanager
def workload_scope(*, account_id: str | None, priority: int) -> Iterator[None]:
    token = _current.set(WorkloadContext(account_id=account_id, priority=priority))
    try:
        yield
    finally:
        _current.reset(token)
