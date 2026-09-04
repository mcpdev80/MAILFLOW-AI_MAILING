"""Resumable application of approved bulk proposal snapshots."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from uuid import UUID

from mailflow_core.providers.imap_generic import ImapGenericProvider

from app import oauth
from app.crypto import decrypt_secret
from app.repositories.account import AccountRepository
from app.repositories.bulk import BulkRepository
from app.secrets import redact_text
from app.services.cycle import _build_attachment_config


@dataclass(frozen=True)
class BulkApplyBatchResult:
    apply_job_id: UUID
    account_id: UUID
    state: str
    processed: int
    applied: int
    skipped: int
    failed: int
    review_required: int
    requeue: bool


class BulkApplyService:
    """Apply one small batch from approved immutable proposal snapshots."""

    def __init__(self, session_factory) -> None:
        self._sf = session_factory

    async def run_batch(self, apply_job_id: UUID) -> BulkApplyBatchResult:
        async with self._sf() as session:
            repo = BulkRepository(session)
            job = await repo.get_apply_job(apply_job_id)
            if job is None:
                raise KeyError(str(apply_job_id))
            if job.state != "running":
                return self._result(job, requeue=False)
            account_id = job.account_id
            proposals = await repo.next_apply_batch(job)

        if not proposals:
            async with self._sf() as session:
                final = await BulkRepository(session).finalize_apply_if_done(apply_job_id)
                await session.commit()
                return self._result(final, requeue=False)

        async with self._sf() as session:
            account, _, _ = await AccountRepository(session).get_full_config(account_id)

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

        try:
            await asyncio.to_thread(provider.connect)
            for proposal in proposals:
                snapshot = dict(proposal.approved_snapshot or {})
                if not snapshot:
                    async with self._sf() as session:
                        await BulkRepository(session).mark_apply_result(
                            apply_job_id,
                            proposal.id,
                            result="review",
                            error="approved_snapshot_missing",
                        )
                        await session.commit()
                    continue

                if snapshot.get("suspicious_content") or snapshot.get("review_required"):
                    async with self._sf() as session:
                        await BulkRepository(session).mark_apply_result(
                            apply_job_id,
                            proposal.id,
                            result="review",
                            error="proposal_requires_review",
                        )
                        await session.commit()
                    continue

                try:
                    batch = await asyncio.to_thread(
                        provider.fetch_historical_batch,
                        proposal.source_folder,
                        after_uid=max(proposal.uid - 1, 0),
                        max_count=1,
                        uid_window=1,
                    )
                    if batch.uidvalidity != proposal.uidvalidity:
                        result = "review"
                        error = "uidvalidity_changed"
                    elif not batch.messages or batch.messages[0].uid != proposal.uid:
                        result = "review"
                        error = "message_missing_or_moved"
                    else:
                        provider.set_source_folder(proposal.source_folder)
                        tags = list(snapshot.get("system_tags") or []) + list(
                            snapshot.get("user_tags") or []
                        )
                        if tags:
                            await asyncio.to_thread(provider.apply_tags, proposal.uid, tags)

                        do_move = bool(snapshot.get("do_move", False))
                        destination = str(snapshot.get("proposed_folder") or "")
                        has_move = do_move and bool(destination) and destination != proposal.source_folder
                        has_action = bool(tags) or has_move

                        if has_action:
                            await asyncio.to_thread(provider.mark_as_processed, proposal.uid)

                        if has_move:
                            moved = await asyncio.to_thread(
                                provider.move_email,
                                proposal.uid,
                                destination,
                            )
                            if not moved:
                                raise RuntimeError("mailbox_move_failed")

                        result = "applied" if has_action else "skipped"
                        error = None
                except Exception as exc:  # noqa: BLE001
                    result = "failed"
                    error = (redact_text(str(exc)) or type(exc).__name__)[:500]

                async with self._sf() as session:
                    await BulkRepository(session).mark_apply_result(
                        apply_job_id,
                        proposal.id,
                        result=result,
                        error=error,
                    )
                    await session.commit()
        finally:
            await asyncio.to_thread(provider.disconnect)
            password = None
            access_token = None

        async with self._sf() as session:
            repo = BulkRepository(session)
            final = await repo.finalize_apply_if_done(apply_job_id)
            await session.commit()
            return self._result(final, requeue=final.state == "running")

    @staticmethod
    def _result(job, *, requeue: bool) -> BulkApplyBatchResult:
        return BulkApplyBatchResult(
            apply_job_id=job.id,
            account_id=job.account_id,
            state=job.state,
            processed=job.processed,
            applied=job.applied,
            skipped=job.skipped,
            failed=job.failed,
            review_required=job.review_required,
            requeue=requeue,
        )
