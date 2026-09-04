"""Read-only historical batches for dry-run/review proposal generation."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from uuid import UUID

from mailflow_core.classification.rule_engine import RuleEngine
from mailflow_core.email_parser import EmailParser
from mailflow_core.providers.imap_generic import ImapGenericProvider

from app import oauth
from app.config import settings
from app.crypto import decrypt_secret
from app.repositories.account import AccountRepository
from app.repositories.backfill import BackfillRepository, BackfillStateError
from app.repositories.bulk import BulkRepository
from app.secrets import redact_text
from app.services.bulk_preview import classify_preview
from app.services.cycle import (
    _build_attachment_config,
    _build_llm_client,
    _collect_inference_health,
)


@dataclass(frozen=True)
class BulkBackfillResult:
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


class BulkBackfillService:
    """Create proposal snapshots without mutating mailbox or processed-message state."""

    def __init__(self, session_factory) -> None:
        self._sf = session_factory

    async def run_batch(self, job_id: UUID) -> BulkBackfillResult:
        async with self._sf() as session:
            job = await BackfillRepository(session).get(job_id)
            if job is None:
                raise KeyError(str(job_id))
            if job.state != "running":
                return self._result(job, requeue=False)
            if job.mode not in {"dry_run", "review"}:
                raise BackfillStateError("bulk_preview_requires_dry_run_or_review")
            account_id = job.account_id
            folder = job.folder
            batch_size = job.batch_size
            cursor_uid = job.cursor_uid

        async with self._sf() as session:
            account, account_config, llm_provider = await AccountRepository(
                session
            ).get_full_config(account_id)

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
        yielded_for_retry = False

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
                    await session.commit()
                    raise
                await session.commit()

            for email_data in batch.messages:
                async with self._sf() as session:
                    backfill_repo = BackfillRepository(session)
                    current = await backfill_repo.get(job_id)
                    if current is None:
                        raise KeyError(str(job_id))
                    if current.state != "running":
                        break
                    existing = await BulkRepository(session).proposal_for_position(
                        job_id,
                        uidvalidity=batch.uidvalidity,
                        uid=email_data.uid,
                    )
                    if existing is not None:
                        review = bool(
                            BulkRepository.effective_snapshot(existing).get(
                                "review_required"
                            )
                        )
                        await backfill_repo.checkpoint(
                            job_id,
                            cursor_uid=email_data.uid,
                            processed_delta=1,
                            successful_delta=1,
                            review_delta=1 if review else 0,
                        )
                        await session.commit()
                        continue

                try:
                    preview = await classify_preview(
                        account=account,
                        source_folder=folder,
                        email_data=email_data,
                        provider=provider,
                        parser=parser,
                        rule_engine=rule_engine,
                        classify_client=classify_client,
                        session_factory=self._sf,
                    )
                except Exception as exc:  # noqa: BLE001
                    safe_error = (redact_text(str(exc)) or type(exc).__name__)[:500]
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

                review = bool(preview.snapshot.get("review_required"))
                async with self._sf() as session:
                    bulk_repo = BulkRepository(session)
                    await bulk_repo.create_proposal(
                        job_id=job_id,
                        account_id=account_id,
                        source_folder=folder,
                        uidvalidity=batch.uidvalidity,
                        uid=email_data.uid,
                        snapshot=dict(preview.snapshot),
                    )
                    backfill_repo = BackfillRepository(session)
                    await backfill_repo.resolve_failure(
                        job_id,
                        uidvalidity=batch.uidvalidity,
                        uid=email_data.uid,
                    )
                    await backfill_repo.checkpoint(
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
                    if batch.done and current is not None and current.state == "running":
                        await repo.transition(job_id, "completed")
                await session.commit()
        finally:
            await asyncio.to_thread(provider.disconnect)
            password = None
            access_token = None

        async with self._sf() as session:
            final = await BackfillRepository(session).get(job_id)
            if final is None:
                raise KeyError(str(job_id))
            return self._result(
                final,
                requeue=final.state == "running",
                yielded_for_retry=yielded_for_retry,
                inference_health=_collect_inference_health(classify_client, None),
            )

    @staticmethod
    def _result(
        job,
        *,
        requeue: bool,
        yielded_for_retry: bool = False,
        inference_health: dict[str, dict[str, object]] | None = None,
    ) -> BulkBackfillResult:
        return BulkBackfillResult(
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
