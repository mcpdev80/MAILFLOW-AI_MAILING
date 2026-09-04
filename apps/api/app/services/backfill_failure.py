"""Targeted retry of one failed historical message without restarting a job."""

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
from app.crypto import decrypt_secret
from app.repositories.account import AccountRepository
from app.repositories.backfill import BackfillRepository, BackfillStateError
from app.repositories.cycle import CycleRepository
from app.secrets import redact_text
from app.services.backfill import _SourceAccountView
from app.services.cycle import (
    _build_attachment_config,
    _build_llm_client,
    _collect_inference_health,
    _process_one,
)

log = logging.getLogger("mailflow.backfill")


@dataclass(frozen=True)
class BackfillFailureRetryResult:
    job_id: UUID
    failure_id: UUID
    account_id: UUID
    resolved: bool
    error: str | None = None
    inference_health: dict[str, dict[str, object]] = field(default_factory=dict)


class BackfillFailureService:
    def __init__(self, session_factory) -> None:
        self._sf = session_factory

    async def retry(self, job_id: UUID, failure_id: UUID) -> BackfillFailureRetryResult:
        async with self._sf() as session:
            repo = BackfillRepository(session)
            job = await repo.get(job_id)
            failure = await repo.get_failure(failure_id)
            if job is None or failure is None or failure.job_id != job_id:
                raise KeyError(str(failure_id))
            if failure.status != "retrying":
                raise BackfillStateError("failure_not_retrying")
            account_id = job.account_id
            folder = job.folder
            expected_uidvalidity = failure.uidvalidity
            target_uid = failure.uid

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
        classify_client = _build_llm_client(llm_provider, for_generation=False)
        generate_client = _build_llm_client(llm_provider, for_generation=True)
        parser = EmailParser()
        rule_engine = RuleEngine(account_config)
        source_account = _SourceAccountView(account, folder)

        cycle_id = uuid4()
        started = time.monotonic()
        stats: dict[str, object] = {
            "emails": 0,
            "drafts": 0,
            "errors": 0,
            "last_error": None,
        }
        async with self._sf() as session:
            await CycleRepository(session).create_audit_log(account_id, cycle_id)
            await session.commit()

        error: str | None = None
        resolved = False
        try:
            await asyncio.to_thread(provider.connect)
            batch = await asyncio.to_thread(
                provider.fetch_historical_batch,
                folder,
                after_uid=max(target_uid - 1, 0),
                max_count=1,
                uid_window=1,
            )
            if batch.uidvalidity != expected_uidvalidity:
                raise BackfillStateError("uidvalidity_changed")
            if not batch.messages or batch.messages[0].uid != target_uid:
                raise BackfillStateError("historical_message_missing")

            await _process_one(
                batch.messages[0],
                source_account,  # type: ignore[arg-type]
                cycle_id,
                provider,
                parser,
                rule_engine,
                classify_client,
                generate_client,
                stats,
                self._sf,
            )

            async with self._sf() as session:
                repo = BackfillRepository(session)
                review = await repo.processed_review_required(
                    account_id,
                    uidvalidity=expected_uidvalidity,
                    uid=target_uid,
                )
                await repo.apply_retry_success(
                    job_id,
                    failure_id,
                    review_required=review,
                )
                await session.commit()
            resolved = True
        except Exception as exc:  # noqa: BLE001 - preserve one-message retry state
            error = (redact_text(str(exc)) or type(exc).__name__)[:500]
            stats["errors"] = int(stats["errors"]) + 1
            stats["last_error"] = error
            async with self._sf() as session:
                repo = BackfillRepository(session)
                failure = await repo.get_failure(failure_id, for_update=True)
                if failure is not None:
                    failure.status = "failed"
                    failure.attempts += 1
                    failure.last_error = error
                    await session.commit()
        finally:
            await asyncio.to_thread(provider.disconnect)
            password = None
            access_token = None
            async with self._sf() as session:
                await CycleRepository(session).finalize_audit_log(
                    cycle_id,
                    emails=int(stats["emails"]),
                    drafts=int(stats["drafts"]),
                    errors=int(stats["errors"]),
                    error_detail=error,
                    duration_ms=int((time.monotonic() - started) * 1000),
                )
                await session.commit()

        return BackfillFailureRetryResult(
            job_id=job_id,
            failure_id=failure_id,
            account_id=account_id,
            resolved=resolved,
            error=error,
            inference_health=_collect_inference_health(
                classify_client,
                generate_client,
            ),
        )
