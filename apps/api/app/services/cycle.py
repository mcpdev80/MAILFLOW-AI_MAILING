"""CycleService orchestration for classification and draft generation."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import cast
from uuid import UUID, uuid4

from mailflow_core.attachments import AttachmentExtractionConfig
from mailflow_core.classification.adaptive import (
    AdaptiveClassificationConfig,
    AdaptiveClassifier,
)
from mailflow_core.classification.llm_client import LLMClient, LLMConfig, ModelRole
from mailflow_core.classification.rule_engine import RuleEngine
from mailflow_core.decision_memory import (
    DecisionMemoryConfig,
    PrefetchedDecisionMemoryLookup,
)
from mailflow_core.email_parser import EmailParser
from mailflow_core.providers.base import EmailData
from mailflow_core.providers.imap_generic import ImapGenericProvider
from mailflow_core.resilience import (
    CircuitBreaker,
    CircuitOpenError,
    RetryPolicy,
    retry_with_backoff,
)
from mailflow_core.types import (
    ClassificationResult,
    DraftRequest,
    ParsedEmail,
    ThreadSummaryUpdate,
)
from sqlalchemy.ext.asyncio import async_sessionmaker

from app import oauth
from app.config import settings
from app.crypto import decrypt_secret
from app.models.email_account import EmailAccount
from app.models.llm_provider import LLMProvider
from app.models.organization import Organization
from app.quota import can_process_more
from app.repositories.account import AccountRepository
from app.repositories.cycle import CycleRepository
from app.repositories.decision_memory import DecisionMemoryRepository
from app.repositories.thread import ThreadRepository
from app.routing import destination_for_classification
from app.secrets import redact_text

log = logging.getLogger("mailflow.cycle")


@dataclass
class CycleResult:
    cycle_id: UUID
    emails_processed: int
    drafts_saved: int
    errors: int


def _optional_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def _provider_string(provider: object, field: str) -> str | None:
    return _optional_string(getattr(provider, field, None))


def _decrypt_llm_key(value: object) -> str | None:
    encrypted = _optional_string(value)
    if not encrypted:
        return None
    return str(decrypt_secret(encrypted)["api_key"])


def _model_role(value: str) -> ModelRole:
    return cast(ModelRole, value)


def _build_llm_client(
    llm_provider: LLMProvider | None,
    *,
    for_generation: bool,
) -> LLMClient | None:
    if llm_provider is None or not llm_provider.is_active:
        return None

    shared_api_key = _decrypt_llm_key(llm_provider.encrypted_api_key)
    if for_generation:
        return LLMClient(
            LLMConfig(
                model_id=(
                    _provider_string(llm_provider, "generation_model")
                    or llm_provider.default_generation_model
                ),
                api_base=(
                    _provider_string(llm_provider, "generation_base_url")
                    or llm_provider.base_url
                ),
                api_key=(
                    _decrypt_llm_key(
                        getattr(llm_provider, "encrypted_generation_api_key", None)
                    )
                    or shared_api_key
                ),
            )
        )

    return LLMClient(
        LLMConfig(
            model_id=llm_provider.default_classification_model,
            api_base=llm_provider.base_url,
            api_key=shared_api_key,
            fast_model_id=_provider_string(llm_provider, "fast_classification_model"),
            fast_api_base=_provider_string(
                llm_provider, "fast_classification_base_url"
            ),
            fast_api_key=(
                _decrypt_llm_key(getattr(llm_provider, "encrypted_fast_api_key", None))
                or shared_api_key
            ),
            deep_model_id=_provider_string(llm_provider, "deep_classification_model"),
            deep_api_base=_provider_string(
                llm_provider, "deep_classification_base_url"
            ),
            deep_api_key=(
                _decrypt_llm_key(getattr(llm_provider, "encrypted_deep_api_key", None))
                or shared_api_key
            ),
            stage_roles=(
                _model_role(settings.CLASSIFICATION_STAGE_0_ROLE),
                _model_role(settings.CLASSIFICATION_STAGE_1_ROLE),
                _model_role(settings.CLASSIFICATION_STAGE_2_ROLE),
                _model_role(settings.CLASSIFICATION_STAGE_3_ROLE),
            ),
            thread_summary_role=_model_role(settings.THREAD_SUMMARY_MODEL_ROLE),
        )
    )


def _build_attachment_config() -> AttachmentExtractionConfig:
    return AttachmentExtractionConfig(
        max_attachment_bytes=settings.ATTACHMENT_MAX_BYTES,
        max_extracted_chars=settings.ATTACHMENT_MAX_EXTRACTED_CHARS,
        max_attachments=settings.ATTACHMENT_MAX_COUNT,
        max_pdf_pages=settings.ATTACHMENT_MAX_PDF_PAGES,
        max_archive_entries=settings.ATTACHMENT_MAX_ARCHIVE_ENTRIES,
        max_archive_uncompressed_bytes=(
            settings.ATTACHMENT_MAX_ARCHIVE_UNCOMPRESSED_BYTES
        ),
    )


def _build_memory_config() -> DecisionMemoryConfig:
    return DecisionMemoryConfig(
        direct_reuse_threshold=settings.DECISION_MEMORY_REUSE_THRESHOLD,
        hint_threshold=settings.DECISION_MEMORY_HINT_THRESHOLD,
        broad_pattern_decay_days=settings.DECISION_MEMORY_DECAY_DAYS,
    )


def _build_draft_bytes(
    subject: str,
    from_email: str,
    to_email: str,
    body_text: str,
    in_reply_to: str | None = None,
) -> bytes:
    msg = MIMEMultipart("alternative")
    reply_subject = subject if subject.lower().startswith("re:") else f"Re: {subject}"
    msg["Subject"] = reply_subject
    msg["From"] = from_email
    msg["To"] = to_email
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
        msg["References"] = in_reply_to
    msg.attach(MIMEText(body_text, "plain", "utf-8"))
    return msg.as_bytes()


class CycleService:
    def __init__(self, session_factory: async_sessionmaker) -> None:
        self._sf = session_factory

    async def run(self, account_id: UUID) -> CycleResult:
        cycle_id = uuid4()
        start = time.monotonic()
        stats: dict = {"emails": 0, "drafts": 0, "errors": 0, "last_error": None}

        now = datetime.now(tz=UTC)
        async with self._sf() as session:
            won = await AccountRepository(session).claim_cycle(account_id, now)
        if not won:
            log.info("Cycle for account %s already claimed, skipping", account_id)
            return CycleResult(cycle_id, 0, 0, 0)

        async with self._sf() as session:
            await CycleRepository(session).create_audit_log(account_id, cycle_id)
            await session.commit()

        async with self._sf() as session:
            account, account_config, llm_provider = await AccountRepository(
                session
            ).get_full_config(account_id)
            await session.commit()

        async with self._sf() as session:
            org = await session.get(Organization, account.org_id)
            plan_key = org.plan if org else None
            if not await can_process_more(session, account.org_id, plan_key):
                await CycleRepository(session).finalize_audit_log(
                    cycle_id,
                    emails=0,
                    drafts=0,
                    errors=0,
                    error_detail="quota_reached",
                    duration_ms=int((time.monotonic() - start) * 1000),
                )
                await session.commit()
                return CycleResult(cycle_id, 0, 0, 0)

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
        parser = EmailParser()
        classify_client = _build_llm_client(llm_provider, for_generation=False)
        generate_client = _build_llm_client(llm_provider, for_generation=True)
        rule_engine = RuleEngine(account_config)
        generation_breaker = CircuitBreaker(failure_threshold=3, reset_timeout=60.0)

        emails: list[EmailData] = []
        try:
            try:

                async def _connect_and_fetch() -> list[EmailData]:
                    def _sync() -> list[EmailData]:
                        provider.connect()
                        return provider.fetch_unprocessed_emails()

                    return await asyncio.to_thread(_sync)

                emails = await retry_with_backoff(
                    _connect_and_fetch,
                    policy=RetryPolicy(max_attempts=3, base_delay=1.0),
                    on_retry=lambda attempt, exc: log.warning(
                        "IMAP fetch retry %d for account %s: %s",
                        attempt,
                        account_id,
                        redact_text(str(exc)),
                    ),
                )
            except Exception as exc:
                safe_error = redact_text(str(exc))
                stats["last_error"] = safe_error
                stats["errors"] += 1
                log.exception(
                    "IMAP fetch failed for account %s: %s", account_id, safe_error
                )

            for email_data in emails:
                try:
                    await _process_one(
                        email_data,
                        account,
                        cycle_id,
                        provider,
                        parser,
                        rule_engine,
                        classify_client,
                        generate_client,
                        generation_breaker,
                        stats,
                        self._sf,
                    )
                except Exception as exc:
                    stats["errors"] += 1
                    safe_error = redact_text(str(exc))
                    stats["last_error"] = safe_error
                    log.exception(
                        "Error processing uid=%s: %s", email_data.uid, safe_error
                    )
        finally:
            await asyncio.to_thread(provider.disconnect)
            password = None
            access_token = None

        duration_ms = int((time.monotonic() - start) * 1000)
        async with self._sf() as session:
            await CycleRepository(session).finalize_audit_log(
                cycle_id,
                emails=stats["emails"],
                drafts=stats["drafts"],
                errors=stats["errors"],
                error_detail=stats["last_error"],
                duration_ms=duration_ms,
            )
            await session.commit()

        return CycleResult(cycle_id, stats["emails"], stats["drafts"], stats["errors"])


async def _process_one(
    email_data: EmailData,
    account: EmailAccount,
    cycle_id: UUID,
    provider: ImapGenericProvider,
    parser: EmailParser,
    rule_engine: RuleEngine,
    classify_client: LLMClient | None,
    generate_client: LLMClient | None,
    generation_breaker: CircuitBreaker,
    stats: dict,
    sf: async_sessionmaker,
) -> None:
    headers_only = parser.parse(email_data)

    async with sf() as session:
        thread_repo = ThreadRepository(session)
        thread = await thread_repo.find_for_message(account.id, headers_only)
        if thread is None:
            thread = await thread_repo.create_thread(account.id, headers_only)
        thread_id = thread.thread_id
        previous_summary = thread.summary
        # Thread resolution belongs to MailFlow rather than the raw provider, so
        # attach it before memory lookup and keep it on every later body parse.
        headers_only = replace(headers_only, thread_id=thread_id)
        memory_candidates = await DecisionMemoryRepository(
            session
        ).candidates_for_email(account.id, headers_only)
        await session.commit()

    def load_body(max_chars: int | None) -> ParsedEmail:
        body_text, body_html = provider.fetch_body(email_data.uid, max_chars)
        parsed_body = parser.parse(
            replace(email_data, body_text=body_text, body_html=body_html)
        )
        return replace(parsed_body, thread_id=thread_id)

    supporting_signal = rule_engine.supporting_signal(headers_only)
    parsed = headers_only
    if classify_client is not None:
        memory_lookup = (
            PrefetchedDecisionMemoryLookup(
                memory_candidates, config=_build_memory_config()
            )
            if memory_candidates
            else None
        )
        adaptive = AdaptiveClassifier(
            classify_client,
            config=AdaptiveClassificationConfig(
                confidence_threshold=settings.CLASSIFICATION_CONFIDENCE_THRESHOLD
            ),
            decision_memory=memory_lookup,
        )
        outcome = await asyncio.to_thread(
            adaptive.classify,
            headers_only,
            thread_summary=previous_summary or None,
            body_loader=load_body,
            supporting_signal=supporting_signal,
        )
        result = outcome.result
        parsed = outcome.email
    else:
        result = supporting_signal or ClassificationResult(
            label="unclassified",
            confidence=0.0,
            method="fallback",
        )

    summary_update: ThreadSummaryUpdate | None = None
    if classify_client is not None and result.method != "decision_memory":
        try:
            summary_update = await asyncio.to_thread(
                classify_client.update_thread_summary,
                previous_summary,
                parsed,
                result,
            )
        except Exception as exc:
            log.warning(
                "Thread summary update failed for uid=%s: %s",
                email_data.uid,
                redact_text(str(exc)),
            )

    destination = destination_for_classification(account, result)
    await asyncio.to_thread(provider.mark_as_processed, email_data.uid)
    await asyncio.to_thread(provider.move_email, email_data.uid, destination)

    draft_saved = False
    if (
        result.method != "domain_internal"
        and result.label != "unclassified"
        and generate_client
    ):
        draft_email = parsed
        if not draft_email.body_text:
            draft_email = await asyncio.to_thread(load_body, None)
        draft_request = DraftRequest(
            in_reply_to_uid=str(email_data.uid),
            folder=provider._drafts_folder,
            subject=draft_email.subject_normalized,
            body_text=draft_email.body_text,
            body_html=draft_email.body_html or None,
            classification=result,
        )

        async def _generate() -> str:
            return await asyncio.to_thread(
                generate_client.generate_draft, draft_email, draft_request
            )

        async def _generate_with_retry() -> str:
            return await retry_with_backoff(
                _generate,
                policy=RetryPolicy(max_attempts=2, base_delay=0.5),
                on_retry=lambda attempt, exc: log.warning(
                    "LLM draft retry %d for uid=%s: %s",
                    attempt,
                    email_data.uid,
                    redact_text(str(exc)),
                ),
            )

        try:
            draft_text = await generation_breaker.call(_generate_with_retry)
        except CircuitOpenError:
            log.warning("LLM circuit open; skipping draft for uid=%s", email_data.uid)
            draft_text = ""
        except Exception as exc:
            log.warning(
                "LLM draft generation failed for uid=%s: %s",
                email_data.uid,
                redact_text(str(exc)),
            )
            draft_text = ""
        if draft_text:
            draft_bytes = _build_draft_bytes(
                subject=draft_email.subject_normalized,
                from_email=account.username,
                to_email=email_data.from_email,
                body_text=draft_text,
                in_reply_to=email_data.message_id,
            )
            draft_saved = await asyncio.to_thread(provider.save_draft, draft_bytes)

    async with sf() as session:
        thread_repo = ThreadRepository(session)
        current_thread = await thread_repo.get_thread(account.id, thread_id)
        if current_thread is None:
            raise RuntimeError("resolved_thread_missing")
        inserted = await CycleRepository(session).insert_processed(
            account_id=account.id,
            uid=email_data.uid,
            folder=account.inbox_folder,
            uidvalidity=provider._uidvalidity.get(account.inbox_folder, 0),
            message_id=email_data.message_id,
            thread_id=thread_id,
            from_email=email_data.from_email,
            subject=email_data.subject,
            destination_folder=destination,
            classification=result,
            auth_signals=parsed.auth_signals,
            draft_saved=draft_saved,
            cycle_id=cycle_id,
        )
        if inserted:
            await thread_repo.apply_message(current_thread, parsed, summary_update)
            if result.decision_memory_id is not None:
                await DecisionMemoryRepository(session).mark_used(
                    account.id, UUID(result.decision_memory_id)
                )
        await session.commit()

    stats["emails"] += 1
    if draft_saved:
        stats["drafts"] += 1
