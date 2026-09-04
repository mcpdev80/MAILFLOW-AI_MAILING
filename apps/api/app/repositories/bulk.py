"""Persistence for dry-run proposals, review decisions and resumable apply jobs."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.lifecycle import record_lifecycle_event
from app.models.bulk import BulkApplyJob, BulkProposal
from app.models.email_account import EmailAccount


class BulkStateError(RuntimeError):
    pass


class BulkRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def _org_id(self, account_id: UUID) -> UUID:
        org_id = await self._session.scalar(
            select(EmailAccount.org_id).where(EmailAccount.id == account_id)
        )
        if org_id is None:
            raise RuntimeError("bulk_account_missing")
        return org_id

    async def get_proposal(
        self, proposal_id: UUID, *, for_update: bool = False
    ) -> BulkProposal | None:
        stmt = select(BulkProposal).where(BulkProposal.id == proposal_id)
        if for_update:
            stmt = stmt.with_for_update()
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def proposal_for_position(
        self, job_id: UUID, *, uidvalidity: int, uid: int
    ) -> BulkProposal | None:
        return (
            await self._session.execute(
                select(BulkProposal).where(
                    BulkProposal.job_id == job_id,
                    BulkProposal.uidvalidity == uidvalidity,
                    BulkProposal.uid == uid,
                )
            )
        ).scalar_one_or_none()

    async def create_proposal(
        self,
        *,
        job_id: UUID,
        account_id: UUID,
        source_folder: str,
        uidvalidity: int,
        uid: int,
        snapshot: dict,
    ) -> BulkProposal:
        existing = await self.proposal_for_position(
            job_id, uidvalidity=uidvalidity, uid=uid
        )
        if existing is not None:
            return existing
        proposal = BulkProposal(
            job_id=job_id,
            account_id=account_id,
            source_folder=source_folder,
            uidvalidity=uidvalidity,
            uid=uid,
            original_snapshot=snapshot,
        )
        self._session.add(proposal)
        await self._session.flush()
        return proposal

    async def list_proposals(
        self,
        job_id: UUID,
        *,
        status: str | None = None,
        category: str | None = None,
        destination: str | None = None,
        review_required: bool | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[BulkProposal]:
        stmt = select(BulkProposal).where(BulkProposal.job_id == job_id)
        if status:
            stmt = stmt.where(BulkProposal.status == status)
        rows = list(
            (
                await self._session.execute(
                    stmt.order_by(BulkProposal.uid.asc()).offset(offset).limit(limit)
                )
            ).scalars()
        )
        if category is not None:
            rows = [
                item
                for item in rows
                if self.effective_snapshot(item).get("category") == category
            ]
        if destination is not None:
            rows = [
                item
                for item in rows
                if self.effective_snapshot(item).get("proposed_folder") == destination
            ]
        if review_required is not None:
            rows = [
                item
                for item in rows
                if bool(self.effective_snapshot(item).get("review_required"))
                is review_required
            ]
        return rows

    @staticmethod
    def effective_snapshot(proposal: BulkProposal) -> dict:
        return dict(proposal.edited_snapshot or proposal.original_snapshot)

    async def edit_proposal(
        self,
        proposal_id: UUID,
        *,
        actor_user_id: str,
        changes: dict,
    ) -> BulkProposal:
        proposal = await self.get_proposal(proposal_id, for_update=True)
        if proposal is None:
            raise KeyError(str(proposal_id))
        if proposal.status != "proposed":
            raise BulkStateError("only proposed items may be edited")
        allowed = {
            "category",
            "subcategory",
            "importance",
            "urgency",
            "action_required",
            "proposed_folder",
            "system_tags",
            "user_tags",
            "do_move",
        }
        unknown = set(changes) - allowed
        if unknown:
            raise ValueError(f"unsupported proposal fields: {sorted(unknown)!r}")
        updated = self.effective_snapshot(proposal)
        updated.update(changes)
        proposal.edited_snapshot = updated
        proposal.updated_at = datetime.now(tz=UTC)
        await self._session.flush()
        await record_lifecycle_event(
            self._session,
            org_id=await self._org_id(proposal.account_id),
            account_id=proposal.account_id,
            actor_user_id=actor_user_id,
            event="bulk_proposal_corrected",
            message_ref=f"{proposal.uidvalidity}:{proposal.uid}",
            details={"proposal_id": str(proposal.id), "fields": sorted(changes)},
        )
        return proposal

    async def exclude_proposal(
        self, proposal_id: UUID, *, actor_user_id: str
    ) -> BulkProposal:
        proposal = await self.get_proposal(proposal_id, for_update=True)
        if proposal is None:
            raise KeyError(str(proposal_id))
        if proposal.status not in {"proposed", "approved"}:
            raise BulkStateError("proposal cannot be excluded in current state")
        proposal.status = "excluded"
        proposal.approved_snapshot = None
        proposal.approval_user_id = None
        proposal.approved_at = None
        proposal.updated_at = datetime.now(tz=UTC)
        await self._session.flush()
        await record_lifecycle_event(
            self._session,
            org_id=await self._org_id(proposal.account_id),
            account_id=proposal.account_id,
            actor_user_id=actor_user_id,
            event="bulk_proposal_excluded",
            message_ref=f"{proposal.uidvalidity}:{proposal.uid}",
            details={"proposal_id": str(proposal.id)},
        )
        return proposal

    async def approve_proposal(
        self, proposal_id: UUID, *, actor_user_id: str
    ) -> BulkProposal:
        proposal = await self.get_proposal(proposal_id, for_update=True)
        if proposal is None:
            raise KeyError(str(proposal_id))
        if proposal.status != "proposed":
            raise BulkStateError("only proposed items may be approved")
        snapshot = self.effective_snapshot(proposal)
        if snapshot.get("suspicious_content") or snapshot.get("review_required"):
            raise BulkStateError("proposal_requires_resolution_before_approval")
        proposal.approved_snapshot = snapshot
        proposal.status = "approved"
        proposal.approval_user_id = actor_user_id
        proposal.approved_at = datetime.now(tz=UTC)
        proposal.updated_at = datetime.now(tz=UTC)
        await self._session.flush()
        await record_lifecycle_event(
            self._session,
            org_id=await self._org_id(proposal.account_id),
            account_id=proposal.account_id,
            actor_user_id=actor_user_id,
            event="bulk_proposal_approved",
            message_ref=f"{proposal.uidvalidity}:{proposal.uid}",
            details={"proposal_id": str(proposal.id), "version": proposal.version},
        )
        return proposal

    async def approve_all_safe(self, job_id: UUID, *, actor_user_id: str) -> int:
        proposals = await self.list_proposals(job_id, status="proposed", limit=100000)
        approved = 0
        for proposal in proposals:
            snapshot = self.effective_snapshot(proposal)
            if snapshot.get("suspicious_content") or snapshot.get("review_required"):
                continue
            await self.approve_proposal(proposal.id, actor_user_id=actor_user_id)
            approved += 1
        return approved

    async def counts(self, job_id: UUID) -> dict[str, int]:
        rows = await self._session.execute(
            select(BulkProposal.status, func.count(BulkProposal.id))
            .where(BulkProposal.job_id == job_id)
            .group_by(BulkProposal.status)
        )
        return {str(status): int(count) for status, count in rows}

    async def get_apply_job(
        self, apply_job_id: UUID, *, for_update: bool = False
    ) -> BulkApplyJob | None:
        stmt = select(BulkApplyJob).where(BulkApplyJob.id == apply_job_id)
        if for_update:
            stmt = stmt.with_for_update()
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def apply_job_for_source(self, source_job_id: UUID) -> BulkApplyJob | None:
        return (
            await self._session.execute(
                select(BulkApplyJob).where(BulkApplyJob.source_job_id == source_job_id)
            )
        ).scalar_one_or_none()

    async def create_apply_job(
        self,
        *,
        source_job_id: UUID,
        account_id: UUID,
        batch_size: int,
        actor_user_id: str,
    ) -> BulkApplyJob:
        existing = await self.apply_job_for_source(source_job_id)
        if existing is not None:
            return existing
        approved = int(
            await self._session.scalar(
                select(func.count(BulkProposal.id)).where(
                    BulkProposal.job_id == source_job_id,
                    BulkProposal.status == "approved",
                )
            )
            or 0
        )
        if approved == 0:
            raise BulkStateError("no_approved_proposals")
        job = BulkApplyJob(
            source_job_id=source_job_id,
            account_id=account_id,
            state="running",
            batch_size=batch_size,
            approved=approved,
        )
        self._session.add(job)
        await self._session.flush()
        await record_lifecycle_event(
            self._session,
            org_id=await self._org_id(account_id),
            account_id=account_id,
            actor_user_id=actor_user_id,
            event="bulk_apply_started",
            details={
                "apply_job_id": str(job.id),
                "source_job_id": str(source_job_id),
                "approved": approved,
            },
        )
        return job

    async def next_apply_batch(self, apply_job: BulkApplyJob) -> list[BulkProposal]:
        return list(
            (
                await self._session.execute(
                    select(BulkProposal)
                    .where(
                        BulkProposal.job_id == apply_job.source_job_id,
                        BulkProposal.status.in_(("approved", "applying")),
                    )
                    .order_by(BulkProposal.uid.asc())
                    .limit(apply_job.batch_size)
                )
            ).scalars()
        )

    async def mark_apply_result(
        self,
        apply_job_id: UUID,
        proposal_id: UUID,
        *,
        result: str,
        error: str | None = None,
    ) -> None:
        if result not in {"applied", "skipped", "failed", "review"}:
            raise ValueError("invalid apply result")
        job = await self.get_apply_job(apply_job_id, for_update=True)
        proposal = await self.get_proposal(proposal_id, for_update=True)
        if job is None or proposal is None or proposal.job_id != job.source_job_id:
            raise KeyError(str(proposal_id))
        proposal.status = result
        proposal.last_error = error[:500] if error else None
        proposal.applied_at = datetime.now(tz=UTC) if result == "applied" else None
        proposal.updated_at = datetime.now(tz=UTC)
        job.processed += 1
        if result == "applied":
            job.applied += 1
        elif result == "skipped":
            job.skipped += 1
        elif result == "failed":
            job.failed += 1
        elif result == "review":
            job.review_required += 1
        job.cursor_id = proposal.id
        job.last_error = error[:500] if error else job.last_error
        job.updated_at = datetime.now(tz=UTC)
        await self._session.flush()

    async def finalize_apply_if_done(self, apply_job_id: UUID) -> BulkApplyJob:
        job = await self.get_apply_job(apply_job_id, for_update=True)
        if job is None:
            raise KeyError(str(apply_job_id))
        remaining = int(
            await self._session.scalar(
                select(func.count(BulkProposal.id)).where(
                    BulkProposal.job_id == job.source_job_id,
                    BulkProposal.status.in_(("approved", "applying")),
                )
            )
            or 0
        )
        if remaining == 0 and job.state == "running":
            job.state = "completed"
            job.updated_at = datetime.now(tz=UTC)
            await self._session.flush()
            await record_lifecycle_event(
                self._session,
                org_id=await self._org_id(job.account_id),
                account_id=job.account_id,
                event="bulk_apply_completed",
                details={
                    "apply_job_id": str(job.id),
                    "applied": job.applied,
                    "skipped": job.skipped,
                    "failed": job.failed,
                    "review_required": job.review_required,
                },
            )
        return job
