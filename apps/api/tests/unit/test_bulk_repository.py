"""Bulk dry-run proposal and apply repository tests."""

from __future__ import annotations

from uuid import uuid4

import pytest

from app.models.email_account import EmailAccount
from app.models.organization import Organization
from app.repositories.backfill import BackfillRepository
from app.repositories.bulk import BulkRepository, BulkStateError


async def _account(session, suffix: str) -> EmailAccount:
    org = Organization(name=f"Bulk {suffix}", slug=f"bulk-{uuid4().hex[:8]}")
    session.add(org)
    await session.flush()
    account = EmailAccount(
        org_id=org.id,
        imap_host="imap.example.com",
        username=f"{suffix}@example.com",
        ownership_mode="shared",
    )
    session.add(account)
    await session.commit()
    return account


def _snapshot(**overrides) -> dict:
    value = {
        "category": "finance",
        "subcategory": "invoice",
        "importance": "normal",
        "urgency": "none",
        "action_required": "no",
        "system_tags": ["information_only"],
        "user_tags": [],
        "confidence": 0.97,
        "review_required": False,
        "suspicious_content": False,
        "proposed_folder": "Invoices",
        "do_move": True,
    }
    value.update(overrides)
    return value


async def test_backfill_defaults_to_dry_run(session) -> None:
    account = await _account(session, "mode")
    job = await BackfillRepository(session).create(account.id)
    await session.commit()
    assert job.mode == "dry_run"


async def test_approved_snapshot_is_immutable_copy(session) -> None:
    account = await _account(session, "approval")
    job = await BackfillRepository(session).create(account.id, mode="dry_run")
    repo = BulkRepository(session)
    proposal = await repo.create_proposal(
        job_id=job.id,
        account_id=account.id,
        source_folder="INBOX",
        uidvalidity=7,
        uid=42,
        snapshot=_snapshot(),
    )
    await repo.edit_proposal(
        proposal.id,
        actor_user_id="user-1",
        changes={"subcategory": "invoices", "proposed_folder": "Rechnungen"},
    )
    approved = await repo.approve_proposal(proposal.id, actor_user_id="user-1")
    await session.commit()

    assert approved.original_snapshot["proposed_folder"] == "Invoices"
    assert approved.edited_snapshot["proposed_folder"] == "Rechnungen"
    assert approved.approved_snapshot["proposed_folder"] == "Rechnungen"
    assert approved.status == "approved"

    with pytest.raises(BulkStateError):
        await repo.edit_proposal(
            proposal.id,
            actor_user_id="user-1",
            changes={"proposed_folder": "Other"},
        )


async def test_unsafe_proposal_cannot_be_approved(session) -> None:
    account = await _account(session, "unsafe")
    job = await BackfillRepository(session).create(account.id, mode="dry_run")
    repo = BulkRepository(session)
    proposal = await repo.create_proposal(
        job_id=job.id,
        account_id=account.id,
        source_folder="INBOX",
        uidvalidity=8,
        uid=1,
        snapshot=_snapshot(review_required=True, suspicious_content=True),
    )

    with pytest.raises(BulkStateError, match="requires_resolution"):
        await repo.approve_proposal(proposal.id, actor_user_id="user-1")


async def test_apply_job_uses_only_approved_proposals(session) -> None:
    account = await _account(session, "apply")
    job = await BackfillRepository(session).create(account.id, mode="dry_run")
    repo = BulkRepository(session)
    approved = await repo.create_proposal(
        job_id=job.id,
        account_id=account.id,
        source_folder="INBOX",
        uidvalidity=9,
        uid=10,
        snapshot=_snapshot(),
    )
    await repo.approve_proposal(approved.id, actor_user_id="user-1")
    await repo.create_proposal(
        job_id=job.id,
        account_id=account.id,
        source_folder="INBOX",
        uidvalidity=9,
        uid=11,
        snapshot=_snapshot(),
    )
    apply_job = await repo.create_apply_job(
        source_job_id=job.id,
        account_id=account.id,
        batch_size=10,
        actor_user_id="user-1",
    )
    await session.commit()

    assert apply_job.approved == 1
    batch = await repo.next_apply_batch(apply_job)
    assert [item.uid for item in batch] == [10]

    await repo.mark_apply_result(apply_job.id, approved.id, result="applied")
    final = await repo.finalize_apply_if_done(apply_job.id)
    await session.commit()
    assert final.state == "completed"
    assert final.applied == 1
    assert final.processed == 1
