"""Global priority-aware admission control for model-bound work.

The controller is intentionally content-free: Redis stores only opaque request ids,
account ids, model roles, endpoint hashes and timing/counter metadata.
"""

from __future__ import annotations

import hashlib
import json
import time
from contextlib import AbstractContextManager
from dataclasses import dataclass
from typing import Final
from uuid import uuid4

import redis

from app.config import settings

PRIORITY_LIVE: Final[int] = 1
PRIORITY_REVIEW: Final[int] = 2
PRIORITY_GENERATION: Final[int] = 3
PRIORITY_BACKFILL: Final[int] = 4
PRIORITY_MAINTENANCE: Final[int] = 5

_PRIORITY_NAMES: Final[dict[int, str]] = {
    PRIORITY_LIVE: "live",
    PRIORITY_REVIEW: "review",
    PRIORITY_GENERATION: "generation",
    PRIORITY_BACKFILL: "backfill",
    PRIORITY_MAINTENANCE: "maintenance",
}

_QUEUE_KEY: Final[str] = "mailflow:workload:queue"
_ACTIVE_KEY: Final[str] = "mailflow:workload:active"
_SEQUENCE_KEY: Final[str] = "mailflow:workload:sequence"
_GRANT_SEQUENCE_KEY: Final[str] = "mailflow:workload:grant-sequence"
_METRICS_KEY: Final[str] = "mailflow:workload:metrics"
_LOCK_KEY: Final[str] = "mailflow:workload:lock"


class WorkloadQueueFull(RuntimeError):
    """Raised only when the configured bounded waiting queue is exhausted."""


class WorkloadAcquireTimeout(RuntimeError):
    """Raised when a request cannot acquire a model slot before its deadline."""


@dataclass(frozen=True)
class _Request:
    token: str
    account_id: str
    role: str
    endpoint_key: str
    priority: int
    enqueued_at: float
    sequence: int

    def encode(self) -> str:
        return json.dumps(
            {
                "token": self.token,
                "account_id": self.account_id,
                "role": self.role,
                "endpoint_key": self.endpoint_key,
                "priority": self.priority,
                "enqueued_at": self.enqueued_at,
                "sequence": self.sequence,
            },
            separators=(",", ":"),
            sort_keys=True,
        )

    @classmethod
    def decode(cls, raw: str) -> "_Request":
        value = json.loads(raw)
        return cls(
            token=str(value["token"]),
            account_id=str(value["account_id"]),
            role=str(value["role"]),
            endpoint_key=str(value["endpoint_key"]),
            priority=int(value["priority"]),
            enqueued_at=float(value["enqueued_at"]),
            sequence=int(value["sequence"]),
        )


@dataclass
class _Lease(AbstractContextManager[None]):
    controller: "RedisWorkloadController"
    request: _Request
    member: str
    started_at: float

    def __enter__(self) -> None:
        return None

    def __exit__(self, exc_type, exc, tb) -> None:
        self.controller.release(self.request, self.member, self.started_at)
        return None


class RedisWorkloadController:
    """Redis-backed scheduler shared by every API/worker process.

    Scheduling is strict by priority class. Within one priority class, accounts
    with the oldest previous grant are considered first, preventing a busy
    mailbox from repeatedly taking every newly available slot.
    """

    def __init__(self, client: redis.Redis | None = None) -> None:
        self._redis = client or redis.Redis.from_url(
            settings.REDIS_URL, decode_responses=True
        )

    @staticmethod
    def _endpoint_key(api_base: str | None, model_id: str) -> str:
        raw = f"{api_base or 'default'}\n{model_id}".encode("utf-8")
        return hashlib.sha256(raw).hexdigest()[:20]

    @staticmethod
    def _role_limit(role: str) -> int:
        if role == "fast":
            return settings.WORKLOAD_FAST_CONCURRENCY
        if role == "deep":
            return settings.WORKLOAD_DEEP_CONCURRENCY
        if role == "generation":
            return settings.WORKLOAD_GENERATION_CONCURRENCY
        raise ValueError(f"unsupported workload role: {role}")

    @staticmethod
    def _role_rpm(role: str) -> int:
        if role == "fast":
            return settings.WORKLOAD_FAST_REQUESTS_PER_MINUTE
        if role == "deep":
            return settings.WORKLOAD_DEEP_REQUESTS_PER_MINUTE
        if role == "generation":
            return settings.WORKLOAD_GENERATION_REQUESTS_PER_MINUTE
        return 0

    @staticmethod
    def _role_min_delay(role: str) -> float:
        if role == "fast":
            return settings.WORKLOAD_FAST_MIN_DELAY_SECONDS
        if role == "deep":
            return settings.WORKLOAD_DEEP_MIN_DELAY_SECONDS
        if role == "generation":
            return settings.WORKLOAD_GENERATION_MIN_DELAY_SECONDS
        return 0.0

    @staticmethod
    def _queue_score(priority: int, sequence: int) -> float:
        return float(priority * 1_000_000_000_000 + sequence)

    def _last_grant_key(self, account_id: str) -> str:
        return f"mailflow:workload:last-grant:{account_id}"

    def _rpm_key(self, request: _Request, minute: int) -> str:
        return f"mailflow:workload:rpm:{request.endpoint_key}:{request.role}:{minute}"

    def _last_request_key(self, request: _Request) -> str:
        return f"mailflow:workload:last-request:{request.endpoint_key}:{request.role}"

    def _load_requests(self, key: str) -> list[tuple[str, _Request]]:
        result: list[tuple[str, _Request]] = []
        for raw in self._redis.zrange(key, 0, -1):
            try:
                result.append((raw, _Request.decode(raw)))
            except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                self._redis.zrem(key, raw)
        return result

    def _cleanup(self, now: float) -> None:
        self._redis.zremrangebyscore(_ACTIVE_KEY, "-inf", now)
        max_age = max(settings.WORKLOAD_WAIT_TIMEOUT_SECONDS * 2.0, 60.0)
        for raw, request in self._load_requests(_QUEUE_KEY):
            if now - request.enqueued_at > max_age:
                self._redis.zrem(_QUEUE_KEY, raw)

    def _active_counts(self) -> tuple[int, dict[str, int], dict[str, int]]:
        role_counts: dict[str, int] = {}
        account_counts: dict[str, int] = {}
        active = self._load_requests(_ACTIVE_KEY)
        for _, request in active:
            role_counts[request.role] = role_counts.get(request.role, 0) + 1
            account_counts[request.account_id] = (
                account_counts.get(request.account_id, 0) + 1
            )
        return len(active), role_counts, account_counts

    def _rate_limit_allows(self, request: _Request, now: float) -> bool:
        rpm = self._role_rpm(request.role)
        if rpm > 0:
            minute = int(now // 60)
            current = int(self._redis.get(self._rpm_key(request, minute)) or 0)
            if current >= rpm:
                return False
        min_delay = self._role_min_delay(request.role)
        if min_delay > 0:
            last = float(self._redis.get(self._last_request_key(request)) or 0.0)
            if now - last < min_delay:
                return False
        return True

    def _eligible(
        self,
        request: _Request,
        *,
        active_total: int,
        role_counts: dict[str, int],
        account_counts: dict[str, int],
        now: float,
    ) -> bool:
        if active_total >= settings.WORKLOAD_GLOBAL_CONCURRENCY:
            return False
        if role_counts.get(request.role, 0) >= self._role_limit(request.role):
            return False
        if (
            account_counts.get(request.account_id, 0)
            >= settings.WORKLOAD_PER_ACCOUNT_CONCURRENCY
        ):
            return False
        if request.priority >= PRIORITY_BACKFILL:
            low_priority_cap = max(
                0,
                settings.WORKLOAD_GLOBAL_CONCURRENCY
                - settings.WORKLOAD_LIVE_RESERVED_SLOTS,
            )
            if active_total >= low_priority_cap:
                return False
        return self._rate_limit_allows(request, now)

    def _select_candidate(self, now: float) -> tuple[str, _Request] | None:
        queued = self._load_requests(_QUEUE_KEY)
        if not queued:
            return None
        highest_priority = min(item.priority for _, item in queued)
        candidates = [
            (raw, item) for raw, item in queued if item.priority == highest_priority
        ]
        active_total, role_counts, account_counts = self._active_counts()

        ranked: list[tuple[int, int, str, _Request]] = []
        for raw, request in candidates:
            if not self._eligible(
                request,
                active_total=active_total,
                role_counts=role_counts,
                account_counts=account_counts,
                now=now,
            ):
                continue
            last_grant = int(
                self._redis.get(self._last_grant_key(request.account_id)) or 0
            )
            ranked.append((last_grant, request.sequence, raw, request))
        if not ranked:
            return None
        ranked.sort(key=lambda item: (item[0], item[1]))
        _, _, raw, request = ranked[0]
        return raw, request

    def _record_grant(self, request: _Request, now: float) -> None:
        rpm = self._role_rpm(request.role)
        if rpm > 0:
            key = self._rpm_key(request, int(now // 60))
            pipe = self._redis.pipeline()
            pipe.incr(key)
            pipe.expire(key, 120)
            pipe.execute()
        if self._role_min_delay(request.role) > 0:
            self._redis.set(self._last_request_key(request), str(now), ex=120)
        grant_sequence = int(self._redis.incr(_GRANT_SEQUENCE_KEY))
        self._redis.set(
            self._last_grant_key(request.account_id), grant_sequence, ex=86_400
        )
        self._redis.hincrby(_METRICS_KEY, f"granted:{request.role}", 1)

    def acquire(
        self,
        *,
        role: str,
        model_id: str,
        api_base: str | None,
        account_id: str | None,
        priority: int,
    ) -> _Lease:
        """Queue and wait for one global model slot."""
        account = account_id or "unknown"
        now = time.time()
        sequence = int(self._redis.incr(_SEQUENCE_KEY))
        request = _Request(
            token=uuid4().hex,
            account_id=account,
            role=role,
            endpoint_key=self._endpoint_key(api_base, model_id),
            priority=priority,
            enqueued_at=now,
            sequence=sequence,
        )
        member = request.encode()

        with self._redis.lock(_LOCK_KEY, timeout=5, blocking_timeout=2):
            self._cleanup(now)
            if int(self._redis.zcard(_QUEUE_KEY)) >= settings.WORKLOAD_QUEUE_MAX:
                self._redis.hincrby(_METRICS_KEY, "queue_full", 1)
                raise WorkloadQueueFull("global model workload queue is full")
            self._redis.zadd(
                _QUEUE_KEY, {member: self._queue_score(priority, sequence)}
            )

        deadline = time.monotonic() + settings.WORKLOAD_WAIT_TIMEOUT_SECONDS
        deferred_recorded = False
        try:
            while True:
                wall_now = time.time()
                with self._redis.lock(_LOCK_KEY, timeout=5, blocking_timeout=2):
                    self._cleanup(wall_now)
                    candidate = self._select_candidate(wall_now)
                    if candidate is not None and candidate[0] == member:
                        self._redis.zrem(_QUEUE_KEY, member)
                        self._redis.zadd(
                            _ACTIVE_KEY,
                            {member: wall_now + settings.WORKLOAD_LEASE_SECONDS},
                        )
                        self._record_grant(request, wall_now)
                        return _Lease(self, request, member, time.monotonic())
                if not deferred_recorded:
                    self._redis.hincrby(_METRICS_KEY, f"deferred:{request.priority}", 1)
                    deferred_recorded = True
                if time.monotonic() >= deadline:
                    self._redis.hincrby(_METRICS_KEY, "acquire_timeout", 1)
                    raise WorkloadAcquireTimeout(
                        "timed out waiting for global model capacity"
                    )
                time.sleep(settings.WORKLOAD_POLL_INTERVAL_SECONDS)
        except Exception:
            self._redis.zrem(_QUEUE_KEY, member)
            raise

    def release(
        self,
        request: _Request,
        member: str,
        started_at: float,
    ) -> None:
        self._redis.zrem(_ACTIVE_KEY, member)
        elapsed_ms = max(0.0, (time.monotonic() - started_at) * 1000.0)
        pipe = self._redis.pipeline()
        pipe.hincrby(_METRICS_KEY, f"completed:{request.role}", 1)
        pipe.hincrbyfloat(_METRICS_KEY, f"latency_ms_total:{request.role}", elapsed_ms)
        pipe.execute()

    def snapshot(self) -> dict[str, object]:
        """Return content-free global queue/concurrency observability."""
        now = time.time()
        with self._redis.lock(_LOCK_KEY, timeout=5, blocking_timeout=2):
            self._cleanup(now)
            queued = [item for _, item in self._load_requests(_QUEUE_KEY)]
            active = [item for _, item in self._load_requests(_ACTIVE_KEY)]
            metrics = {
                str(k): float(v) for k, v in self._redis.hgetall(_METRICS_KEY).items()
            }

        queued_by_priority: dict[str, int] = {}
        queued_by_account: dict[str, int] = {}
        active_by_role: dict[str, int] = {}
        for item in queued:
            name = _PRIORITY_NAMES.get(item.priority, str(item.priority))
            queued_by_priority[name] = queued_by_priority.get(name, 0) + 1
            queued_by_account[item.account_id] = (
                queued_by_account.get(item.account_id, 0) + 1
            )
        for item in active:
            active_by_role[item.role] = active_by_role.get(item.role, 0) + 1

        latency_ms: dict[str, float] = {}
        for role in ("fast", "deep", "generation"):
            completed = metrics.get(f"completed:{role}", 0.0)
            total = metrics.get(f"latency_ms_total:{role}", 0.0)
            latency_ms[role] = round(total / completed, 1) if completed else 0.0

        higher_waiting = any(item.priority < PRIORITY_BACKFILL for item in queued)
        return {
            "active_total": len(active),
            "active_by_role": active_by_role,
            "queued_total": len(queued),
            "queued_by_priority": queued_by_priority,
            "queued_by_account": queued_by_account,
            "limits": {
                "global": settings.WORKLOAD_GLOBAL_CONCURRENCY,
                "per_account": settings.WORKLOAD_PER_ACCOUNT_CONCURRENCY,
                "fast": settings.WORKLOAD_FAST_CONCURRENCY,
                "deep": settings.WORKLOAD_DEEP_CONCURRENCY,
                "generation": settings.WORKLOAD_GENERATION_CONCURRENCY,
                "live_reserved": settings.WORKLOAD_LIVE_RESERVED_SLOTS,
                "queue_max": settings.WORKLOAD_QUEUE_MAX,
            },
            "average_request_latency_ms": latency_ms,
            "throttled_or_deferred": int(
                sum(
                    value
                    for key, value in metrics.items()
                    if key.startswith("deferred:")
                )
            ),
            "backfill_yielding": bool(
                queued_by_priority.get("backfill", 0) and higher_waiting
            ),
        }


_controller: RedisWorkloadController | None = None


def get_workload_controller() -> RedisWorkloadController:
    global _controller
    if _controller is None:
        _controller = RedisWorkloadController()
    return _controller
