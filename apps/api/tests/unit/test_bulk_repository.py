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


async def test_edit_rejects_unknown_fields(session) -> None:
    account = await _account(session, "unknown")
    job = await BackfillRepository(session).create(account.id)
    repo = BulkRepository(session)
    proposal = await repo.create_proposal(
        job_id=job.id,
        account_id=account.id,
        source_folder="INBOX",
        uidvalidity=1,
        uid=1,
        snapshot=_snapshot(),
    )
    with pytest.raises(ValueError, match="unsupported proposal fields"):
        await repo.edit_proposal(
            proposal.id,
            actor_user_id="user-1",
            changes={"body": "must-not-be-stored"},
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


async def test_filters_counts_and_exclusion(session) -> None:
    account = await _account(session, "filters")
    job = await BackfillRepository(session).create(account.id)
    repo = BulkRepository(session)
    first = await repo.create_proposal(
        job_id=job.id,
        account_id=account.id,
        source_folder="INBOX",
        uidvalidity=2,
        uid=1,
        snapshot=_snapshot(),
    )
    second = await repo.create_proposal(
        job_id=job.id,
        account_id=account.id,
        source_folder="INBOX",
        uidvalidity=2,
        uid=2,
        snapshot=_snapshot(
            category="work",
            proposed_folder="Work",
            review_required=True,
        ),
    )
    await repo.exclude_proposal(first.id, actor_user_id="user-1")
    await session.commit()

    assert [p.id for p in await repo.list_proposals(job.id, status="excluded")] == [
        first.id
    ]
    assert [p.id for p in await repo.list_proposals(job.id, category="work")] == [
        second.id
    ]
    assert [p.id for p in await repo.list_proposals(job.id, destination="Work")] == [
        second.id
    ]
    assert [p.id for p in await repo.list_proposals(job.id, review_required=True)] == [
        second.id
    ]
    assert await repo.counts(job.id) == {"excluded": 1, "proposed": 1}


async def test_approve_all_safe_skips_review_items(session) -> None:
    account = await _account(session, "approveall")
    job = await BackfillRepository(session).create(account.id)
    repo = BulkRepository(session)
    safe = await repo.create_proposal(
        job_id=job.id,
        account_id=account.id,
        source_folder="INBOX",
        uidvalidity=3,
        uid=1,
        snapshot=_snapshot(),
    )
    unsafe = await repo.create_proposal(
        job_id=job.id,
        account_id=account.id,
        source_folder="INBOX",
        uidvalidity=3,
        uid=2,
        snapshot=_snapshot(review_required=True),
    )
    approved = await repo.approve_all_safe(job.id, actor_user_id="user-1")
    await session.commit()

    assert approved == 1
    assert (await repo.get_proposal(safe.id)).status == "approved"
    assert (await repo.get_proposal(unsafe.id)).status == "proposed"


async def test_apply_job_requires_approved_proposals(session) -> None:
    account = await _account(session, "none")
    job = await BackfillRepository(session).create(account.id)
    repo = BulkRepository(session)
    with pytest.raises(BulkStateError, match="no_approved_proposals"):
        await repo.create_apply_job(
            source_job_id=job.id,
            account_id=account.id,
            batch_size=10,
            actor_user_id="user-1",
        )


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
    assert (await repo.apply_job_for_source(job.id)).id == apply_job.id
    batch = await repo.next_apply_batch(apply_job)
    assert [item.uid for item in batch] == [10]

    await repo.mark_apply_result(apply_job.id, approved.id, result="applied")
    final = await repo.finalize_apply_if_done(apply_job.id)
    await session.commit()
    assert final.state == "completed"
    assert final.applied == 1
    assert final.processed == 1


@pytest.mark.parametrize(
    ("result", "counter"),
    [("skipped", "skipped"), ("failed", "failed"), ("review", "review_required")],
)
async def test_apply_result_counters(session, result: str, counter: str) -> None:
    account = await _account(session, f"counter-{result}")
    job = await BackfillRepository(session).create(account.id)
    repo = BulkRepository(session)
    proposal = await repo.create_proposal(
        job_id=job.id,
        account_id=account.id,
        source_folder="INBOX",
        uidvalidity=10,
        uid=1,
        snapshot=_snapshot(),
    )
    await repo.approve_proposal(proposal.id, actor_user_id="user-1")
    apply_job = await repo.create_apply_job(
        source_job_id=job.id,
        account_id=account.id,
        batch_size=10,
        actor_user_id="user-1",
    )
    await repo.mark_apply_result(
        apply_job.id,
        proposal.id,
        result=result,
        error="problem" if result in {"failed", "review"} else None,
    )
    await session.commit()

    assert apply_job.processed == 1
    assert getattr(apply_job, counter) == 1
    if result in {"failed", "review"}:
        assert apply_job.last_error == "problem"


async def test_invalid_apply_result_is_rejected(session) -> None:
    account = await _account(session, "invalid-result")
    job = await BackfillRepository(session).create(account.id)
    repo = BulkRepository(session)
    proposal = await repo.create_proposal(
        job_id=job.id,
        account_id=account.id,
        source_folder="INBOX",
        uidvalidity=11,
        uid=1,
        snapshot=_snapshot(),
    )
    await repo.approve_proposal(proposal.id, actor_user_id="user-1")
    apply_job = await repo.create_apply_job(
        source_job_id=job.id,
        account_id=account.id,
        batch_size=10,
        actor_user_id="user-1",
    )
    with pytest.raises(ValueError, match="invalid apply result"):
        await repo.mark_apply_result(apply_job.id, proposal.id, result="sent")
