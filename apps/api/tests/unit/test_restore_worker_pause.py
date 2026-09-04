"""Worker pause behavior during restore."""

from __future__ import annotations

from worker import main as worker_main


async def test_paused_worker_skips_queued_cycle(monkeypatch):
    monkeypatch.setattr(worker_main.settings, "WORKER_PAUSED", True)

    result = await worker_main.process_account_cycle({}, "00000000-0000-0000-0000-000000000001")

    assert result == {
        "account_id": "00000000-0000-0000-0000-000000000001",
        "skipped": "worker_paused",
    }


async def test_paused_worker_does_not_schedule_cycles(monkeypatch):
    monkeypatch.setattr(worker_main.settings, "WORKER_PAUSED", True)

    await worker_main.schedule_cycles({})
