"""AccountRepository tests against real Postgres.

Requires: docker compose up -d postgres
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from app.models.email_account import EmailAccount
from app.models.organization import Organization
from app.models.rules import DomainRule as DbDomainRule
from app.models.rules import InternalDomain
from app.models.rules import KeywordRule as DbKeywordRule
from app.repositories.account import AccountRepository
from mailflow_core.classification.rule_engine import AccountConfig

TEST_SECRET_KEY = "qdCa5nGhLjd8qY0CCaQP2dE000lbSYDmtPnhzAVeVgs="


@pytest.fixture()
async def org(session):
    o = Organization(name="Test Org", slug=f"test-{uuid4().hex[:8]}")
    session.add(o)
    await session.commit()
    return o


@pytest.fixture()
async def account(session, org):
    from app.crypto import encrypt

    acc = EmailAccount(
        org_id=org.id,
        imap_host="localhost",
        imap_port=1143,
        use_ssl=False,
        username="test",
        encrypted_credentials=encrypt({"password": "pw"}, TEST_SECRET_KEY),
        interval_minutes=5,
    )
    session.add(acc)
    await session.commit()
    return acc


async def test_get_accounts_due_includes_never_run(session, account):
    repo = AccountRepository(session)
    now = datetime.now(tz=UTC)
    result = await repo.get_accounts_due(now)
    ids = [a.id for a in result]
    assert account.id in ids


async def test_get_accounts_due_includes_overdue(session, account):
    account.last_cycle_at = datetime.now(tz=UTC) - timedelta(minutes=10)
    await session.commit()

    repo = AccountRepository(session)
    result = await repo.get_accounts_due(datetime.now(tz=UTC))
    assert account.id in [a.id for a in result]


async def test_get_accounts_due_excludes_recent(session, account):
    account.last_cycle_at = datetime.now(tz=UTC) - timedelta(minutes=2)
    await session.commit()

    repo = AccountRepository(session)
    result = await repo.get_accounts_due(datetime.now(tz=UTC))
    assert account.id not in [a.id for a in result]


async def test_get_accounts_due_excludes_inactive(session, account):
    account.is_active = False
    await session.commit()

    repo = AccountRepository(session)
    result = await repo.get_accounts_due(datetime.now(tz=UTC))
    assert account.id not in [a.id for a in result]


async def test_multi_mode_excludes_unresolved_legacy_account(
    session, account, monkeypatch
):
    """Ambiguous migrated accounts must not be processed before ownership is set."""
    from app.config import settings

    assert account.ownership_mode == "unresolved"
    monkeypatch.setattr(settings, "AUTH_MODE", "multi")

    repo = AccountRepository(session)
    result = await repo.get_accounts_due(datetime.now(tz=UTC))
    assert account.id not in [a.id for a in result]

    won = await repo.claim_cycle(account.id, datetime.now(tz=UTC))
    assert won is False


async def test_claim_cycle_returns_true_first_call(session, account):
    repo = AccountRepository(session)
    now = datetime.now(tz=UTC)
    won = await repo.claim_cycle(account.id, now)
    assert won is True


async def test_claim_cycle_returns_false_second_call(session_factory, account):
    """Two workers race for the same account; only one may win."""
    now = datetime.now(tz=UTC)
    async with session_factory() as s1:
        won1 = await AccountRepository(s1).claim_cycle(account.id, now)
        await s1.commit()
    async with session_factory() as s2:
        won2 = await AccountRepository(s2).claim_cycle(account.id, now)
    assert won1 is True
    assert won2 is False


async def test_get_full_config_builds_account_config(session, account):
    session.add(
        DbDomainRule(
            account_id=account.id,
            domain="client.com",
            label="Clients/Client",
            rule_id="r1",
            priority=0,
        )
    )
    session.add(
        DbKeywordRule(
            account_id=account.id,
            keywords=["urgent", "ASAP"],
            label="Urgent",
            rule_id="r2",
            match_all=False,
            priority=1,
        )
    )
    session.add(InternalDomain(account_id=account.id, domain="company.com"))
    await session.commit()

    repo = AccountRepository(session)
    _acc_model, config, llm_prov = await repo.get_full_config(account.id)

    assert isinstance(config, AccountConfig)
    assert config.account_id == str(account.id)
    assert "company.com" in config.internal_domains
    assert len(config.client_domain_rules) == 1
    assert config.client_domain_rules[0].domain == "client.com"
    assert len(config.keyword_rules) == 1
    assert config.keyword_rules[0].keywords == ("urgent", "ASAP")
    assert llm_prov is None
