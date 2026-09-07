"""AccountRepository — email account queries and processing configuration."""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from uuid import UUID

from mailflow_core.classification.rule_engine import AccountConfig
from mailflow_core.classification.rule_engine import DomainRule as CoreDomainRule
from mailflow_core.classification.rule_engine import KeywordRule as CoreKeywordRule
from sqlalchemy import or_, select, text, true, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.email_account import EmailAccount
from app.models.llm_provider import LLMProvider
from app.models.rules import DomainRule as DbDomainRule
from app.models.rules import InternalDomain
from app.models.rules import KeywordRule as DbKeywordRule


class AccountRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def _due_condition(self, now: datetime):
        """Return the shared predicate for an active account whose interval is due."""
        interval_expr = EmailAccount.interval_minutes * text("INTERVAL '1 minute'")
        return or_(
            EmailAccount.last_cycle_at.is_(None),
            EmailAccount.last_cycle_at + interval_expr <= now,
        )

    def _processable_ownership_condition(self):
        """Prevent ambiguous legacy ownership from being processed in multi mode.

        Existing accounts enter ``unresolved`` during migration. Letting the
        worker continue moving mail before an owner is assigned would defeat the
        fail-closed migration strategy. Legacy single-tenant mode keeps its old
        behavior because there is no per-user authorization there.
        """
        if settings.AUTH_MODE == "multi":
            return EmailAccount.ownership_mode.in_(("private", "shared"))
        return true()

    async def get_accounts_due(self, now: datetime) -> list[EmailAccount]:
        """Return active accounts whose processing interval has elapsed."""
        stmt = select(EmailAccount).where(
            EmailAccount.is_active.is_(True),
            self._due_condition(now),
            self._processable_ownership_condition(),
        )
        return list((await self._session.execute(stmt)).scalars())

    async def is_processing_allowed(self, account_id: UUID) -> bool:
        """Re-check the lifecycle fence before mailbox/provider mutations."""
        stmt = select(EmailAccount.id).where(
            EmailAccount.id == account_id,
            EmailAccount.is_active.is_(True),
            self._processable_ownership_condition(),
        )
        return (await self._session.execute(stmt)).scalar_one_or_none() is not None

    async def claim_cycle(self, account_id: UUID, now: datetime) -> bool:
        """Atomically claim a due account while preserving ownership safety."""
        interval_expr = EmailAccount.interval_minutes * text("INTERVAL '1 minute'")
        stmt = (
            update(EmailAccount)
            .where(
                EmailAccount.id == account_id,
                EmailAccount.is_active.is_(True),
                self._processable_ownership_condition(),
                or_(
                    EmailAccount.last_cycle_at.is_(None),
                    EmailAccount.last_cycle_at + interval_expr <= now,
                ),
            )
            .values(last_cycle_at=now)
            .returning(EmailAccount.id)
        )
        result = await self._session.execute(stmt)
        await self._session.commit()
        return result.scalar_one_or_none() is not None

    async def get_full_config(
        self, account_id: UUID
    ) -> tuple[EmailAccount, AccountConfig, LLMProvider | None]:
        """Load account, rules and LLM provider efficiently for the worker."""
        stmt = (
            select(EmailAccount)
            .options(selectinload(EmailAccount.llm_provider))
            .where(EmailAccount.id == account_id)
        )
        account = (await self._session.execute(stmt)).scalar_one()

        db_domain = list(
            (
                await self._session.execute(
                    select(DbDomainRule)
                    .where(DbDomainRule.account_id == account_id)
                    .order_by(DbDomainRule.priority)
                )
            ).scalars()
        )

        db_kw = list(
            (
                await self._session.execute(
                    select(DbKeywordRule)
                    .where(DbKeywordRule.account_id == account_id)
                    .order_by(DbKeywordRule.priority)
                )
            ).scalars()
        )

        db_int = list(
            (
                await self._session.execute(
                    select(InternalDomain).where(
                        InternalDomain.account_id == account_id
                    )
                )
            ).scalars()
        )

        account_config = AccountConfig(
            account_id=str(account_id),
            internal_domains=[d.domain for d in db_int],
            client_domain_rules=[
                CoreDomainRule(domain=r.domain, label=r.label, rule_id=r.rule_id)
                for r in db_domain
            ],
            keyword_rules=[
                CoreKeywordRule(
                    keywords=tuple(r.keywords),
                    label=r.label,
                    rule_id=r.rule_id,
                    match_all=r.match_all,
                )
                for r in db_kw
            ],
        )

        resolved_provider = await self._resolve_role_provider(
            account.org_id, account.llm_provider
        )
        return account, account_config, resolved_provider

    async def _resolve_role_provider(
        self, org_id: UUID, fallback: LLMProvider | None
    ) -> LLMProvider | None:
        rows = list(
            (
                await self._session.execute(
                    text(
                        "SELECT a.role, a.provider_id, a.model_id "
                        "FROM llm_role_assignments a "
                        "JOIN llm_models m ON m.provider_id = a.provider_id AND m.model_id = a.model_id "
                        "JOIN llm_org_model_access access ON access.model_id = m.id AND access.org_id = a.org_id "
                        "WHERE a.org_id = :org_id AND m.is_enabled = true"
                    ),
                    {"org_id": org_id},
                )
            )
        )
        if not rows:
            return fallback

        provider_ids = {row.provider_id for row in rows}
        providers = list(
            (
                await self._session.execute(
                    select(LLMProvider).where(
                        LLMProvider.id.in_(provider_ids),
                        LLMProvider.is_active.is_(True),
                    )
                )
            ).scalars()
        )
        by_id = {provider.id: provider for provider in providers}
        assignments = {row.role: row for row in rows if row.provider_id in by_id}
        if not assignments:
            return fallback

        def provider_for(role: str) -> LLMProvider | None:
            item = assignments.get(role)
            if item is not None:
                return by_id.get(item.provider_id)
            return fallback

        def model_for(role: str, provider: LLMProvider | None) -> str | None:
            item = assignments.get(role)
            if item is not None and item.model_id:
                model_id = str(item.model_id)
            elif provider is None:
                return None
            elif role == "generation":
                model_id = (
                    provider.generation_model or provider.default_generation_model
                )
            elif role == "deep":
                model_id = (
                    provider.deep_classification_model
                    or provider.default_classification_model
                )
            else:
                model_id = (
                    provider.fast_classification_model
                    or provider.default_classification_model
                )
            if provider is None or "/" in model_id:
                return model_id
            prefix = {
                "anthropic": "anthropic",
                "gemini": "gemini",
                "openrouter": "openrouter",
                "ollama": "ollama",
                "custom": "openai",
            }.get(provider.type.lower())
            return f"{prefix}/{model_id}" if prefix else model_id

        fast_provider = provider_for("fast")
        deep_provider = provider_for("deep") or fast_provider
        generation_provider = provider_for("generation") or fallback or fast_provider
        if fast_provider is None:
            fast_provider = deep_provider or generation_provider
        if fast_provider is None:
            return fallback

        fast_model = (
            model_for("fast", fast_provider)
            or fast_provider.default_classification_model
        )
        deep_model = model_for("deep", deep_provider) or fast_model
        generation_model = model_for("generation", generation_provider) or fast_model
        return SimpleNamespace(
            is_active=True,
            type=fast_provider.type,
            base_url=fast_provider.base_url,
            encrypted_api_key=fast_provider.encrypted_api_key,
            default_classification_model=fast_model,
            default_generation_model=generation_model,
            fast_classification_model=fast_model,
            deep_classification_model=deep_model,
            generation_model=generation_model,
            fast_classification_base_url=fast_provider.base_url,
            deep_classification_base_url=deep_provider.base_url
            if deep_provider
            else fast_provider.base_url,
            generation_base_url=generation_provider.base_url
            if generation_provider
            else fast_provider.base_url,
            encrypted_fast_api_key=fast_provider.encrypted_api_key,
            encrypted_deep_api_key=deep_provider.encrypted_api_key
            if deep_provider
            else fast_provider.encrypted_api_key,
            encrypted_generation_api_key=generation_provider.encrypted_api_key
            if generation_provider
            else fast_provider.encrypted_api_key,
        )
