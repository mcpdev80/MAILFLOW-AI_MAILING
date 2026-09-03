"""AccountRepository — email account queries and processing configuration."""

from __future__ import annotations

from datetime import datetime
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

        return account, account_config, account.llm_provider
