"""ARQ worker entry point."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from app.config import settings
from app.database import async_session_factory
from app.logging_config import bind_log_context, clear_log_context, setup_logging
from app.observability import init_sentry
from app.repositories.account import AccountRepository
from app.secret_storage import validate_stored_secrets
from app.services.cycle import CycleService
from arq import cron
from arq.connections import RedisSettings

log = logging.getLogger("mailflow.worker")


async def on_startup(ctx: dict) -> None:
    """Initialize shared resources and verify the worker can decrypt stored secrets."""
    setup_logging()
    init_sentry()
    ctx["session_factory"] = async_session_factory
    async with async_session_factory() as session:
        validated = await validate_stored_secrets(session)
    log.info("Validated %d encrypted application secrets", validated)


async def process_account_cycle(ctx: dict, account_id: str) -> dict:
    """Process one mailbox by stable ID; plaintext credentials never enter Redis."""
    job_try = ctx.get("job_try", 1)
    bind_log_context(account_id=account_id, job_id=ctx.get("job_id"), job_try=job_try)
    try:
        log.info("cycle start account=%s try=%d", account_id, job_try)
        service = CycleService(ctx["session_factory"])
        result = await service.run(UUID(account_id))
        log.info(
            "cycle done account=%s emails=%d drafts=%d errors=%d",
            account_id,
            result.emails_processed,
            result.drafts_saved,
            result.errors,
            extra={
                "event": "cycle_completed",
                "cycle_id": str(result.cycle_id),
                "emails_processed": result.emails_processed,
                "drafts_saved": result.drafts_saved,
                "errors": result.errors,
            },
        )
    finally:
        clear_log_context()
    return {
        "account_id": account_id,
        "cycle_id": str(result.cycle_id),
        "emails_processed": result.emails_processed,
        "drafts_saved": result.drafts_saved,
        "errors": result.errors,
    }


async def on_job_failure(ctx: dict, exc: BaseException) -> None:
    job_id = ctx.get("job_id")
    func = ctx.get("job_name") or ctx.get("function")
    log.error(
        "DEAD-LETTER job_id=%s func=%s exhausted retries: %s: %s",
        job_id,
        func,
        type(exc).__name__,
        exc,
        extra={
            "event": "dead_letter",
            "job_id": job_id,
            "func": func,
            "error_type": type(exc).__name__,
        },
    )


async def schedule_cycles(ctx: dict) -> None:
    """Enqueue due accounts by ID only."""
    now = datetime.now(tz=UTC)
    async with ctx["session_factory"]() as session:
        accounts = await AccountRepository(session).get_accounts_due(now)

    redis = ctx["redis"]
    for account in accounts:
        await redis.enqueue_job(
            "process_account_cycle",
            str(account.id),
            _job_id=f"cycle-{account.id}",
        )
    log.info("Scheduled %d account cycles", len(accounts))


class WorkerSettings:
    functions = [process_account_cycle]
    cron_jobs = [cron(schedule_cycles, minute={0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55})]
    on_startup = on_startup
    on_job_failure = on_job_failure
    max_tries = 3
    job_timeout = 300
    queue_name = "mailflow:default"
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
