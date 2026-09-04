"""ARQ worker entry point."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from uuid import UUID

from app.backfill_queue import enqueue_backfill_batch, enqueue_backfill_failure_retry
from app.config import settings
from app.database import async_session_factory
from app.inference_health import inference_health_key, publish_inference_health
from app.lifecycle import purge_expired_lifecycle_events
from app.logging_config import bind_log_context, clear_log_context, setup_logging
from app.observability import init_sentry
from app.repositories.account import AccountRepository
from app.repositories.backfill import BackfillRepository
from app.repositories.bulk import BulkRepository
from app.restore_validation import validate_schema_revision
from app.secret_storage import validate_stored_secrets
from app.services.backfill import BackfillService
from app.services.backfill_failure import BackfillFailureService
from app.services.bulk_apply import BulkApplyService
from app.services.bulk_backfill import BulkBackfillService
from app.services.bulk_backfill_failure import BulkBackfillFailureService
from app.services.cycle import CycleService
from app.workload import PRIORITY_BACKFILL, PRIORITY_LIVE, PRIORITY_REVIEW
from app.workload_context import workload_scope
from arq import cron
from arq.connections import RedisSettings

log = logging.getLogger("mailflow.worker")
WORKER_MAX_TRIES = 3


async def on_startup(ctx: dict) -> None:
    setup_logging()
    init_sentry()
    ctx["session_factory"] = async_session_factory
    async with async_session_factory() as session:
        revision = await validate_schema_revision(session)
        validated = await validate_stored_secrets(session)
    log.info(
        "Validated database schema revision %s and %d encrypted application secrets",
        revision,
        validated,
    )
    if settings.WORKER_PAUSED:
        log.warning("Worker processing is paused by WORKER_PAUSED; mailbox mutations are disabled")


async def process_account_cycle(ctx: dict, account_id: str) -> dict:
    if settings.WORKER_PAUSED:
        return {"account_id": account_id, "skipped": "worker_paused"}
    job_try = ctx.get("job_try", 1)
    bind_log_context(account_id=account_id, job_id=ctx.get("job_id"), job_try=job_try)
    try:
        with workload_scope(account_id=account_id, priority=PRIORITY_LIVE):
            result = await CycleService(ctx["session_factory"]).run(UUID(account_id))
        if result.inference_health:
            try:
                await publish_inference_health(ctx["redis"], account_id, result.inference_health)
            except Exception as exc:  # noqa: BLE001
                log.warning("Could not publish inference health: %s", type(exc).__name__)
    finally:
        clear_log_context()
    return {
        "account_id": account_id,
        "cycle_id": str(result.cycle_id),
        "emails_processed": result.emails_processed,
        "drafts_saved": result.drafts_saved,
        "errors": result.errors,
    }


async def _published_inference_is_degraded(redis, account_id: str) -> bool:
    raw = await redis.get(inference_health_key(account_id))
    if raw is None:
        return False
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    try:
        payload = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return False
    if not isinstance(payload, dict) or payload.get("degraded") is not True:
        return False
    updated_raw = payload.get("updated_at")
    if not isinstance(updated_raw, str):
        return True
    try:
        updated_at = datetime.fromisoformat(updated_raw)
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=UTC)
    except ValueError:
        return True
    age = (datetime.now(tz=UTC) - updated_at.astimezone(UTC)).total_seconds()
    return age < settings.LLM_CIRCUIT_RESET_SECONDS


async def _set_backfill_state(
    ctx: dict,
    job_id: str,
    *,
    state: str,
    reason: str,
) -> None:
    async with ctx["session_factory"]() as session:
        repo = BackfillRepository(session)
        job = await repo.get(UUID(job_id), for_update=True)
        if job is not None and job.state == "running":
            try:
                await repo.transition(UUID(job_id), state, actor_type="system")
            except Exception:
                job.state = state
            job.last_error = reason[:500]
            await session.commit()


async def _pause_running_backfill(ctx: dict, job_id: str, reason: str) -> None:
    await _set_backfill_state(ctx, job_id, state="paused", reason=reason)


async def _fail_running_backfill(ctx: dict, job_id: str, reason: str) -> None:
    await _set_backfill_state(ctx, job_id, state="failed", reason=reason)


async def _restore_retryable_failure(
    ctx: dict,
    failure_id: str,
    reason: str,
) -> None:
    async with ctx["session_factory"]() as session:
        failure = await BackfillRepository(session).get_failure(UUID(failure_id), for_update=True)
        if failure is not None and failure.status == "retrying":
            failure.status = "failed"
            failure.last_error = reason[:500]
            await session.commit()


async def process_backfill_batch(ctx: dict, job_id: str) -> dict:
    if settings.WORKER_PAUSED:
        await _pause_running_backfill(ctx, job_id, "worker_paused")
        return {
            "job_id": job_id,
            "state": "paused",
            "skipped": "worker_paused",
        }

    async with ctx["session_factory"]() as session:
        job = await BackfillRepository(session).get(UUID(job_id))
        if job is None:
            return {"job_id": job_id, "skipped": "not_found"}
        account_id = str(job.account_id)
        cursor_uid = job.cursor_uid
        state = job.state
        mode = job.mode
    if state != "running":
        return {"job_id": job_id, "state": state, "requeued": False}

    if await _published_inference_is_degraded(ctx["redis"], account_id):
        delay = max(
            settings.BACKFILL_REQUEUE_DELAY_SECONDS,
            settings.LLM_CIRCUIT_RESET_SECONDS,
        )
        requeued = await enqueue_backfill_batch(
            ctx["redis"],
            job_id=job_id,
            cursor_uid=cursor_uid,
            defer_seconds=delay,
            unique_retry=True,
        )
        if not requeued:
            await _pause_running_backfill(ctx, job_id, "backfill_requeue_failed")
        return {
            "job_id": job_id,
            "account_id": account_id,
            "state": "running" if requeued else "paused",
            "yielded": "inference_degraded",
            "requeued": requeued,
        }

    job_try = int(ctx.get("job_try", 1) or 1)
    bind_log_context(account_id=account_id, job_id=job_id, job_try=job_try)
    try:
        try:
            with workload_scope(account_id=account_id, priority=PRIORITY_BACKFILL):
                if mode in {"dry_run", "review"}:
                    result = await BulkBackfillService(ctx["session_factory"]).run_batch(
                        UUID(job_id)
                    )
                else:
                    result = await BackfillService(ctx["session_factory"]).run_batch(
                        UUID(job_id)
                    )
        except Exception as exc:
            if job_try >= WORKER_MAX_TRIES:
                await _fail_running_backfill(
                    ctx,
                    job_id,
                    f"batch_worker_failed:{type(exc).__name__}",
                )
            raise

        if result.inference_health:
            try:
                await publish_inference_health(ctx["redis"], account_id, result.inference_health)
            except Exception as exc:  # noqa: BLE001
                log.warning("Could not publish backfill health: %s", type(exc).__name__)

        requeued = False
        if result.requeue:
            delay = (
                max(
                    settings.BACKFILL_REQUEUE_DELAY_SECONDS,
                    settings.LLM_CIRCUIT_RESET_SECONDS,
                )
                if result.yielded_for_retry
                else settings.BACKFILL_REQUEUE_DELAY_SECONDS
            )
            requeued = await enqueue_backfill_batch(
                ctx["redis"],
                job_id=result.job_id,
                cursor_uid=result.cursor_uid,
                defer_seconds=delay,
                unique_retry=result.yielded_for_retry,
            )
            if not requeued:
                await _pause_running_backfill(ctx, job_id, "backfill_requeue_failed")
        return {
            "job_id": job_id,
            "account_id": account_id,
            "mode": mode,
            "state": result.state if requeued or not result.requeue else "paused",
            "cursor_uid": result.cursor_uid,
            "processed": result.processed,
            "successful": result.successful,
            "review_required": result.review_required,
            "failed": result.failed,
            "requeued": requeued,
        }
    finally:
        clear_log_context()


async def process_backfill_failure(ctx: dict, job_id: str, failure_id: str) -> dict:
    """Retry exactly one failed UID without rewinding the historical scan cursor."""
    if settings.WORKER_PAUSED:
        await _restore_retryable_failure(ctx, failure_id, "worker_paused")
        return {
            "job_id": job_id,
            "failure_id": failure_id,
            "state": "failed",
            "skipped": "worker_paused",
        }

    async with ctx["session_factory"]() as session:
        repo = BackfillRepository(session)
        job = await repo.get(UUID(job_id))
        failure = await repo.get_failure(UUID(failure_id))
        if job is None or failure is None or failure.job_id != job.id:
            return {"job_id": job_id, "failure_id": failure_id, "skipped": "not_found"}
        account_id = str(job.account_id)
        mode = job.mode
        if failure.status != "retrying":
            return {
                "job_id": job_id,
                "failure_id": failure_id,
                "state": failure.status,
            }

    if await _published_inference_is_degraded(ctx["redis"], account_id):
        delay = max(
            settings.BACKFILL_REQUEUE_DELAY_SECONDS,
            settings.LLM_CIRCUIT_RESET_SECONDS,
        )
        requeued = await enqueue_backfill_failure_retry(
            ctx["redis"],
            job_id=job_id,
            failure_id=failure_id,
            defer_seconds=delay,
        )
        if not requeued:
            await _restore_retryable_failure(ctx, failure_id, "backfill_retry_requeue_failed")
        return {
            "job_id": job_id,
            "failure_id": failure_id,
            "yielded": "inference_degraded",
            "requeued": requeued,
        }

    with workload_scope(account_id=account_id, priority=PRIORITY_REVIEW):
        if mode in {"dry_run", "review"}:
            result = await BulkBackfillFailureService(ctx["session_factory"]).retry(
                UUID(job_id), UUID(failure_id)
            )
        else:
            result = await BackfillFailureService(ctx["session_factory"]).retry(
                UUID(job_id), UUID(failure_id)
            )
    if result.inference_health:
        try:
            await publish_inference_health(ctx["redis"], account_id, result.inference_health)
        except Exception as exc:  # noqa: BLE001
            log.warning("Could not publish retry health: %s", type(exc).__name__)
    return {
        "job_id": job_id,
        "failure_id": failure_id,
        "account_id": account_id,
        "mode": mode,
        "resolved": result.resolved,
        "error": result.error,
    }


async def process_bulk_apply(ctx: dict, apply_job_id: str) -> dict:
    """Apply one approved snapshot batch and requeue until complete."""
    async with ctx["session_factory"]() as session:
        repo = BulkRepository(session)
        job = await repo.get_apply_job(UUID(apply_job_id), for_update=True)
        if job is None:
            return {"apply_job_id": apply_job_id, "skipped": "not_found"}
        if settings.WORKER_PAUSED:
            if job.state == "running":
                job.state = "paused"
                job.last_error = "worker_paused"
                await session.commit()
            return {"apply_job_id": apply_job_id, "state": job.state, "skipped": "worker_paused"}
        account_id = str(job.account_id)
        state = job.state
    if state != "running":
        return {"apply_job_id": apply_job_id, "state": state, "requeued": False}

    bind_log_context(account_id=account_id, job_id=apply_job_id, job_try=ctx.get("job_try", 1))
    try:
        with workload_scope(account_id=account_id, priority=PRIORITY_REVIEW):
            result = await BulkApplyService(ctx["session_factory"]).run_batch(
                UUID(apply_job_id)
            )
        requeued = False
        if result.requeue:
            queued = await ctx["redis"].enqueue_job(
                "process_bulk_apply",
                apply_job_id,
                _defer_by=settings.BACKFILL_REQUEUE_DELAY_SECONDS,
            )
            requeued = queued is not None
            if not requeued:
                async with ctx["session_factory"]() as session:
                    job = await BulkRepository(session).get_apply_job(
                        UUID(apply_job_id), for_update=True
                    )
                    if job is not None and job.state == "running":
                        job.state = "paused"
                        job.last_error = "apply_requeue_failed"
                        await session.commit()
        return {
            "apply_job_id": apply_job_id,
            "account_id": account_id,
            "state": result.state if requeued or not result.requeue else "paused",
            "processed": result.processed,
            "applied": result.applied,
            "skipped": result.skipped,
            "failed": result.failed,
            "review_required": result.review_required,
            "requeued": requeued,
        }
    finally:
        clear_log_context()


async def on_job_failure(ctx: dict, exc: BaseException) -> None:
    log.error(
        "DEAD-LETTER job_id=%s func=%s exhausted retries: %s: %s",
        ctx.get("job_id"),
        ctx.get("job_name") or ctx.get("function"),
        type(exc).__name__,
        exc,
        extra={"event": "dead_letter", "error_type": type(exc).__name__},
    )


async def schedule_cycles(ctx: dict) -> None:
    if settings.WORKER_PAUSED:
        return
    now = datetime.now(tz=UTC)
    async with ctx["session_factory"]() as session:
        accounts = await AccountRepository(session).get_accounts_due(now)
    for account in accounts:
        await ctx["redis"].enqueue_job(
            "process_account_cycle",
            str(account.id),
            _job_id=f"cycle-{account.id}",
        )


async def cleanup_lifecycle_history(ctx: dict) -> None:
    async with ctx["session_factory"]() as session:
        deleted = await purge_expired_lifecycle_events(
            session,
            retention_days=settings.LIFECYCLE_AUDIT_RETENTION_DAYS,
            batch_size=settings.LIFECYCLE_CLEANUP_BATCH_SIZE,
        )
        await session.commit()
    if deleted:
        log.info("Purged %d expired lifecycle events", deleted)


class WorkerSettings:
    functions = [
        process_account_cycle,
        process_backfill_batch,
        process_backfill_failure,
        process_bulk_apply,
    ]
    cron_jobs = [
        cron(
            schedule_cycles,
            minute={0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55},
        ),
        cron(cleanup_lifecycle_history, minute=17),
    ]
    on_startup = on_startup
    on_job_failure = on_job_failure
    max_tries = WORKER_MAX_TRIES
    job_timeout = 300
    queue_name = "mailflow:default"
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
