"""CycleRepository tests with real Postgres."""

from __future__ import annotations

from uuid import uuid4

import pytest
from mailflow_core.types import ClassificationResult
from sqlalchemy import select

from app.crypto import encrypt
from app.models.audit_log import AuditLog
from app.models.email_account import EmailAccount
from app.models.organization import Organization
from app.models.processed_email import ProcessedEmail
from app.repositories.cycle import CycleRepository

TEST_SECRET_KEY = "qdCa5nGhLjd8qY0CCaQP2dE000lbSYDmtPnhzAVeVgs="


@pytest.fixture()
async def org(session):
    organization = Organization(name="Org", slug=f"org-{uuid4().hex[:8]}")
    session.add(organization)
    await session.commit()
    return organization


@pytest.fixture()
async def account(session, org):
    mailbox = EmailAccount(
        org_id=org.id,
        imap_host="localhost",
        imap_port=1143,
        use_ssl=False,
        username="test",
        encrypted_credentials=encrypt({"password": "pw"}, TEST_SECRET_KEY),
    )
    session.add(mailbox)
    await session.commit()
    return mailbox


def semantic_result() -> ClassificationResult:
    return ClassificationResult(
        label="Clients/B",
        category="finance",
        subcategory="invoice",
        importance="high",
        urgency="today",
        action_required="yes",
        confidence=0.95,
        method="llm",
        user_tags=("customer-b",),
    )


async def test_create_audit_log(session, account):
    repo = CycleRepository(session)
    cycle_id = uuid4()
    log = await repo.create_audit_log(account.id, cycle_id)
    await session.commit()

    assert log.cycle_id == cycle_id
    assert log.account_id == account.id
    assert log.finalized_at is None
    assert log.emails_processed == 0


async def test_finalize_audit_log(session, account):
    cycle_id = uuid4()
    repo = CycleRepository(session)
    await repo.create_audit_log(account.id, cycle_id)
    await session.commit()

    await repo.finalize_audit_log(
        cycle_id,
        emails=3,
        drafts=1,
        errors=0,
        error_detail=None,
        duration_ms=1500,
    )
    await session.commit()

    log = (
        await session.execute(select(AuditLog).where(AuditLog.cycle_id == cycle_id))
    ).scalar_one()
    assert log.emails_processed == 3
    assert log.drafts_saved == 1
    assert log.duration_ms == 1500
    assert log.finalized_at is not None


async def test_insert_processed_idempotent_and_persists_semantics(session, account):
    cycle_id = uuid4()
    session.add(AuditLog(account_id=account.id, cycle_id=cycle_id))
    await session.commit()

    repo = CycleRepository(session)
    kwargs = dict(
        account_id=account.id,
        uid=42,
        folder="INBOX",
        uidvalidity=1000,
        message_id="<msg@test>",
        thread_id="thread-123",
        from_email="a@b.com",
        subject="Hi",
        destination_folder="Clients/B",
        classification=semantic_result(),
        draft_saved=False,
        cycle_id=cycle_id,
    )
    await repo.insert_processed(**kwargs)
    await session.commit()
    await repo.insert_processed(**kwargs)
    await session.commit()

    rows = list(
        (
            await session.execute(
                select(ProcessedEmail).where(ProcessedEmail.account_id == account.id)
            )
        ).scalars()
    )
    assert len(rows) == 1
    row = rows[0]
    assert row.thread_id == "thread-123"
    assert row.destination_folder == "Clients/B"
    assert row.classification_label == "Clients/B"
    assert row.category == "finance"
    assert row.subcategory == "invoice"
    assert row.importance == "high"
    assert row.urgency == "today"
    assert row.action_required == "yes"
    assert row.system_tags == ["today", "action_required"]
    assert row.user_tags == ["customer-b"]
