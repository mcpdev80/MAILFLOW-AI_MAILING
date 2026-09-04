from __future__ import annotations

import time
from collections import defaultdict

from app import workload
from app.workload import (
    PRIORITY_BACKFILL,
    PRIORITY_GENERATION,
    PRIORITY_LIVE,
    RedisWorkloadController,
    _Request,
)


class _Lock:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return None


class _Pipeline:
    def __init__(self, client):
        self.client = client
        self.calls = []

    def incr(self, key):
        self.calls.append(("incr", key, None))
        return self

    def expire(self, key, value):
        self.calls.append(("expire", key, value))
        return self

    def hincrby(self, key, field, value):
        self.calls.append(("hincrby", key, (field, value)))
        return self

    def hincrbyfloat(self, key, field, value):
        self.calls.append(("hincrbyfloat", key, (field, value)))
        return self

    def execute(self):
        for method, key, value in self.calls:
            if method == "expire":
                continue
            if method == "incr":
                self.client.incr(key)
            elif method == "hincrby":
                field, amount = value
                self.client.hincrby(key, field, amount)
            elif method == "hincrbyfloat":
                field, amount = value
                self.client.hincrbyfloat(key, field, amount)
        return []


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.zsets = defaultdict(dict)
        self.hashes = defaultdict(dict)

    def lock(self, *args, **kwargs):
        return _Lock()

    def pipeline(self):
        return _Pipeline(self)

    def incr(self, key):
        value = int(self.values.get(key, 0)) + 1
        self.values[key] = str(value)
        return value

    def get(self, key):
        return self.values.get(key)

    def set(self, key, value, ex=None):
        self.values[key] = str(value)
        return True

    def expire(self, key, value):
        return True

    def zadd(self, key, mapping):
        self.zsets[key].update(mapping)
        return len(mapping)

    def zrem(self, key, *members):
        removed = 0
        for member in members:
            removed += int(self.zsets[key].pop(member, None) is not None)
        return removed

    def zrange(self, key, start, end):
        items = sorted(self.zsets[key].items(), key=lambda item: (item[1], item[0]))
        members = [member for member, _ in items]
        if end == -1:
            return members[start:]
        return members[start : end + 1]

    def zremrangebyscore(self, key, minimum, maximum):
        low = float("-inf") if minimum == "-inf" else float(minimum)
        high = float("inf") if maximum == "+inf" else float(maximum)
        doomed = [member for member, score in self.zsets[key].items() if low <= score <= high]
        return self.zrem(key, *doomed)

    def zcard(self, key):
        return len(self.zsets[key])

    def hgetall(self, key):
        return dict(self.hashes[key])

    def hincrby(self, key, field, amount):
        value = int(float(self.hashes[key].get(field, 0))) + amount
        self.hashes[key][field] = str(value)
        return value

    def hincrbyfloat(self, key, field, amount):
        value = float(self.hashes[key].get(field, 0.0)) + amount
        self.hashes[key][field] = str(value)
        return value


def _request(token, account, priority, sequence, role="fast", enqueued_at=100.0):
    return _Request(
        token=token,
        account_id=account,
        role=role,
        endpoint_key="endpoint",
        priority=priority,
        enqueued_at=enqueued_at,
        sequence=sequence,
    )


def _queue(client, request):
    client.zadd(
        workload._QUEUE_KEY,
        {request.encode(): RedisWorkloadController._queue_score(request.priority, request.sequence)},
    )


def _active(client, request, until=9999.0):
    client.zadd(workload._ACTIVE_KEY, {request.encode(): until})


def test_live_priority_beats_generation_and_backfill(monkeypatch):
    client = FakeRedis()
    controller = RedisWorkloadController(client)
    monkeypatch.setattr(workload.settings, "WORKLOAD_GLOBAL_CONCURRENCY", 3)
    monkeypatch.setattr(workload.settings, "WORKLOAD_FAST_CONCURRENCY", 2)
    monkeypatch.setattr(workload.settings, "WORKLOAD_PER_ACCOUNT_CONCURRENCY", 1)

    backfill = _request("b", "a", PRIORITY_BACKFILL, 1)
    generation = _request("g", "b", PRIORITY_GENERATION, 2, role="generation")
    live = _request("l", "c", PRIORITY_LIVE, 3)
    for item in (backfill, generation, live):
        _queue(client, item)

    selected = controller._select_candidate(101.0)
    assert selected is not None
    assert selected[1].token == "l"


def test_same_priority_rotates_to_account_with_oldest_grant(monkeypatch):
    client = FakeRedis()
    controller = RedisWorkloadController(client)
    monkeypatch.setattr(workload.settings, "WORKLOAD_GLOBAL_CONCURRENCY", 3)
    monkeypatch.setattr(workload.settings, "WORKLOAD_FAST_CONCURRENCY", 3)
    monkeypatch.setattr(workload.settings, "WORKLOAD_PER_ACCOUNT_CONCURRENCY", 1)

    a = _request("a", "account-a", PRIORITY_LIVE, 1)
    b = _request("b", "account-b", PRIORITY_LIVE, 2)
    _queue(client, a)
    _queue(client, b)
    client.set(controller._last_grant_key("account-a"), 20)
    client.set(controller._last_grant_key("account-b"), 5)

    selected = controller._select_candidate(101.0)
    assert selected is not None
    assert selected[1].account_id == "account-b"


def test_role_and_per_account_caps_prevent_monopoly(monkeypatch):
    client = FakeRedis()
    controller = RedisWorkloadController(client)
    monkeypatch.setattr(workload.settings, "WORKLOAD_GLOBAL_CONCURRENCY", 3)
    monkeypatch.setattr(workload.settings, "WORKLOAD_FAST_CONCURRENCY", 2)
    monkeypatch.setattr(workload.settings, "WORKLOAD_PER_ACCOUNT_CONCURRENCY", 1)

    _active(client, _request("active", "account-a", PRIORITY_LIVE, 1))
    blocked = _request("blocked", "account-a", PRIORITY_LIVE, 2)
    allowed = _request("allowed", "account-b", PRIORITY_LIVE, 3)
    _queue(client, blocked)
    _queue(client, allowed)

    selected = controller._select_candidate(101.0)
    assert selected is not None
    assert selected[1].token == "allowed"


def test_backfill_respects_reserved_live_capacity(monkeypatch):
    client = FakeRedis()
    controller = RedisWorkloadController(client)
    monkeypatch.setattr(workload.settings, "WORKLOAD_GLOBAL_CONCURRENCY", 3)
    monkeypatch.setattr(workload.settings, "WORKLOAD_FAST_CONCURRENCY", 3)
    monkeypatch.setattr(workload.settings, "WORKLOAD_PER_ACCOUNT_CONCURRENCY", 1)
    monkeypatch.setattr(workload.settings, "WORKLOAD_LIVE_RESERVED_SLOTS", 1)

    _active(client, _request("x", "account-x", PRIORITY_BACKFILL, 1))
    _active(client, _request("y", "account-y", PRIORITY_BACKFILL, 2))
    waiting = _request("z", "account-z", PRIORITY_BACKFILL, 3)
    _queue(client, waiting)

    assert controller._select_candidate(101.0) is None


def test_rate_limit_blocks_role_until_next_window(monkeypatch):
    client = FakeRedis()
    controller = RedisWorkloadController(client)
    monkeypatch.setattr(workload.settings, "WORKLOAD_GLOBAL_CONCURRENCY", 3)
    monkeypatch.setattr(workload.settings, "WORKLOAD_FAST_CONCURRENCY", 2)
    monkeypatch.setattr(workload.settings, "WORKLOAD_PER_ACCOUNT_CONCURRENCY", 1)
    monkeypatch.setattr(workload.settings, "WORKLOAD_FAST_REQUESTS_PER_MINUTE", 1)

    request = _request("a", "account-a", PRIORITY_LIVE, 1)
    _queue(client, request)
    minute = int(101.0 // 60)
    client.set(controller._rpm_key(request, minute), 1)

    assert controller._select_candidate(101.0) is None
    assert controller._select_candidate(121.0) is not None


def test_snapshot_reports_backfill_yield_when_higher_priority_waits(monkeypatch):
    client = FakeRedis()
    controller = RedisWorkloadController(client)
    monkeypatch.setattr(workload.settings, "WORKLOAD_WAIT_TIMEOUT_SECONDS", 300.0)
    now = time.time()

    _queue(client, _request("b", "account-b", PRIORITY_BACKFILL, 1, enqueued_at=now))
    _queue(client, _request("l", "account-l", PRIORITY_LIVE, 2, enqueued_at=now))

    snapshot = controller.snapshot()
    assert snapshot["backfill_yielding"] is True
    assert snapshot["queued_by_priority"] == {"backfill": 1, "live": 1}
