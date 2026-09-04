"""ARQ worker smoke tests without starting Redis."""


def test_worker_settings_queue_name():
    from worker.main import WorkerSettings

    assert WorkerSettings.queue_name == "mailflow:default"


def test_worker_settings_has_process_function():
    from worker.main import WorkerSettings, process_account_cycle

    assert process_account_cycle in WorkerSettings.functions


def test_worker_settings_has_expected_cron_jobs():
    from worker.main import WorkerSettings, cleanup_lifecycle_history, schedule_cycles

    coroutines = {job.coroutine for job in WorkerSettings.cron_jobs}
    assert coroutines == {schedule_cycles, cleanup_lifecycle_history}


def test_worker_settings_has_retry_and_timeout():
    from worker.main import WorkerSettings, on_job_failure

    assert WorkerSettings.max_tries == 3
    assert WorkerSettings.job_timeout == 300
    assert WorkerSettings.on_job_failure is on_job_failure


async def test_on_job_failure_logs_dead_letter(caplog):
    import logging

    from worker.main import on_job_failure

    ctx = {"job_id": "cycle-abc", "job_name": "process_account_cycle"}
    with caplog.at_level(logging.ERROR, logger="mailflow.worker"):
        await on_job_failure(ctx, RuntimeError("db down"))

    assert any(
        "DEAD-LETTER" in r.message and "cycle-abc" in r.message for r in caplog.records
    )
