"""One-batch historical mailbox processing using the normal live pipeline."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from uuid import UUID, uuid4

from mailflow_core.classification.rule_engine import RuleEngine
from mailflow_core.email_parser import EmailParser
from mailflow_core.providers.imap_generic import ImapGenericProvider

from app import oauth
from app.config import settings
from app.crypto import decrypt_secret
from app.repositories.account import AccountRepository
from app.repositories.backfill import BackfillRepository, BackfillStateError
from app.repositories.cycle import CycleRepository
from app.secrets import redact_text
from app.services.cycle import (
    _build_attachment_config,
    _build_llm_client,
    _collect_inference_health,
    _process_one,
)

log = logging.getLogger("mailflow.backfill")


class _SourceAccountView:
    """Read-only account proxy overriding only the source/inbox folder."""

    def __init__(self, account: object, source_folder: str) -> None:
        self._account = account
        self.inbox_folder = source_folder

    def __getattr__(self, name: str):
        return getattr(self._account, name)


@dataclass(frozen=True)
class BackfillBatchResult:
    job_id: UUID
    account_id: UUID
    state: str
    cursor_uid: int | None
    processed: int
    successful: int
    review_required: int
    failed: int
    requeue: bool
    yielded_for_retry: bool = False
    inference_health: dict[str, dict[str, object]] = field(default_factory=dict)


class BackfillService:
    """Process exactly one persisted backfill batch then yield to the queue."""

    def __init__(self, session_factory) -> None:
        self._sf = session_factory

    async def run_batch(self, job_id: UUID) -> BackfillBatchResult:
        async with self._sf() as session:
            repo = BackfillRepository(session)
            job = await repo.get(job_id)
            if job is None:
                raise KeyError(str(job_id))
            if job.state != "running":
                return self._result(job, requeue=False)
            account_id = job.account_id
            folder = job.folder
            batch_size = job.batch_size
            cursor_uid = job.cursor_uid

        async with self._sf() as session:
            account, account_config, llm_provider = await AccountRepository(
                session
            ).get_full_config(account_id)
            await session.commit()

        password: str | None = None
        access_token: str | None = None
        if account.provider_type in ("gmail", "microsoft") and account.encrypted_oauth:
            refresh_token = str(
                decrypt_secret(account.encrypted_oauth)["refresh_token"]
            )
            access_token = await asyncio.to_thread(
                oauth.access_token_from_refresh,
                account.provider_type,
                refresh_token,
            )
        elif account.encrypted_credentials:
            password = str(decrypt_secret(account.encrypted_credentials)["password"])

        provider = ImapGenericProvider(
            host=account.imap_host,
            port=account.imap_port,
            username=account.username,
            password=password,
            use_ssl=account.use_ssl,
            access_token=access_token,
            attachment_config=_build_attachment_config(),
        )
        provider.set_source_folder(folder)
        parser = EmailParser()
        rule_engine = RuleEngine(account_config)
        classify_client = _build_llm_client(llm_provider, for_generation=False)
        generate_client = _build_llm_client(llm_provider, for_generation=True)
        source_account = _SourceAccountView(account, folder)

        cycle_id = uuid4()
        cycle_start = time.monotonic()
        cycle_stats: dict[str, object] = {
            "emails": 0,
            "drafts": 0,
            "errors": 0,
            "last_error": None,
        }
        async with self._sf() as session:
            await CycleRepository(session).create_audit_log(account_id, cycle_id)
            await session.commit()

        yielded_for_retry = False
        batch = None
        try:
            await asyncio.to_thread(provider.connect)
            batch = await asyncio.to_thread(
                provider.fetch_historical_batch,
                folder,
                after_uid=cursor_uid,
                max_count=batch_size,
            )

            async with self._sf() as session:
                repo = BackfillRepository(session)
                try:
                    await repo.initialize_discovery(
                        job_id,
                        uidvalidity=batch.uidvalidity,
                        total_discovered=batch.total_discovered,
                    )
                except BackfillStateError:
                    # Persist the failed state before propagating the reset.
                    await session.commit()
                    raise
                else:
                    await session.commit()

            for email_data in batch.messages:
                async with self._sf() as session:
                    repo = BackfillRepository(session)
                    current = await repo.get(job_id)
                    if current is None:
                        raise KeyError(str(job_id))
                    if current.state != "running":
                        break
                    if await repo.is_processed(
                        account_id,
                        uidvalidity=batch.uidvalidity,
                        uid=email_data.uid,
                    ):
                        review = await repo.processed_review_required(
                            account_id,
                            uidvalidity=batch.uidvalidity,
                            uid=email_data.uid,
                        )
                        await repo.resolve_failure(
                            job_id,
                            uidvalidity=batch.uidvalidity,
                            uid=email_data.uid,
                        )
                        await repo.checkpoint(
                            job_id,
                            cursor_uid=email_data.uid,
                            processed_delta=1,
                            successful_delta=1,
                            review_delta=1 if review else 0,
                        )
                        await session.commit()
                        continue

                before_emails = int(cycle_stats["emails"])
                try:
                    await _process_one(
                        email_data,
                        source_account,  # type: ignore[arg-type]
                        cycle_id,
                        provider,
                        parser,
                        rule_engine,
                        classify_client,
                        generate_client,
                        cycle_stats,
                        self._sf,
                    )
                except Exception as exc:  # noqa: BLE001 - isolate one historical message
                    safe_error = (redact_text(str(exc)) or type(exc).__name__)[:500]
                    cycle_stats["errors"] = int(cycle_stats["errors"]) + 1
                    cycle_stats["last_error"] = safe_error
                    async with self._sf() as session:
                        repo = BackfillRepository(session)
                        failure = await repo.record_failure(
                            job_id,
                            uidvalidity=batch.uidvalidity,
                            uid=email_data.uid,
                            classification_stage=None,
                            error=safe_error,
                        )
                        if failure.attempts < settings.BACKFILL_MAX_ATTEMPTS:
                            # Keep the cursor before this UID. A later batch retries
                            # it instead of burning through history during an outage.
                            await session.commit()
                            yielded_for_retry = True
                            break
                        await repo.checkpoint(
                            job_id,
                            cursor_uid=email_data.uid,
                            processed_delta=1,
                            failed_delta=1,
                            last_error=safe_error,
                        )
                        await session.commit()
                    continue

                if int(cycle_stats["emails"]) == before_emails:
                    yielded_for_retry = True
                    break

                async with self._sf() as session:
                    repo = BackfillRepository(session)
                    review = await repo.processed_review_required(
                        account_id,
                        uidvalidity=batch.uidvalidity,
                        uid=email_data.uid,
                    )
                    await repo.resolve_failure(
                        job_id,
                        uidvalidity=batch.uidvalidity,
                        uid=email_data.uid,
                    )
                    await repo.checkpoint(
                        job_id,
                        cursor_uid=email_data.uid,
                        processed_delta=1,
                        successful_delta=1,
                        review_delta=1 if review else 0,
                    )
                    await session.commit()

            async with self._sf() as session:
                repo = BackfillRepository(session)
                current = await repo.get(job_id, for_update=True)
                if current is None:
                    raise KeyError(str(job_id))
                if current.state == "running" and not yielded_for_retry:
                    if batch.scan_cursor > (current.cursor_uid or 0):
                        await repo.checkpoint(job_id, cursor_uid=batch.scan_cursor)
                        current = await repo.get(job_id, for_update=True)
                    if (
                        batch.done
                        and current is not None
                        and current.state == "running"
                    ):
                        await repo.transition(job_id, "completed")
                await session.commit()

        finally:
            await asyncio.to_thread(provider.disconnect)
            password = None
            access_token = None
            async with self._sf() as session:
                await CycleRepository(session).finalize_audit_log(
                    cycle_id,
                    emails=int(cycle_stats["emails"]),
                    drafts=int(cycle_stats["drafts"]),
                    errors=int(cycle_stats["errors"]),
                    error_detail=(
                        str(cycle_stats["last_error"])
                        if cycle_stats["last_error"] is not None
                        else None
                    ),
                    duration_ms=int((time.monotonic() - cycle_start) * 1000),
                )
                await session.commit()

        async with self._sf() as session:
            final = await BackfillRepository(session).get(job_id)
            if final is None:
                raise KeyError(str(job_id))
            return self._result(
                final,
                requeue=final.state == "running",
                yielded_for_retry=yielded_for_retry,
                inference_health=_collect_inference_health(
                    classify_client,
                    generate_client,
                ),
            )

    @staticmethod
    def _result(
        job,
        *,
        requeue: bool,
        yielded_for_retry: bool = False,
        inference_health: dict[str, dict[str, object]] | None = None,
    ) -> BackfillBatchResult:
        return BackfillBatchResult(
            job_id=job.id,
            account_id=job.account_id,
            state=job.state,
            cursor_uid=job.cursor_uid,
            processed=job.processed,
            successful=job.successful,
            review_required=job.review_required,
            failed=job.failed,
            requeue=requeue,
            yielded_for_retry=yielded_for_retry,
            inference_health=inference_health or {},
        )
