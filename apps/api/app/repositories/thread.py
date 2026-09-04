"""Repository for reliable thread matching and compact thread state."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from mailflow_core.types import ParsedEmail, ThreadSummaryUpdate
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.processed_email import ProcessedEmail
from app.models.thread_summary import ThreadSummary


class ThreadRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_thread(self, account_id: UUID, thread_id: str) -> ThreadSummary | None:
        return await self._session.scalar(
            select(ThreadSummary).where(
                ThreadSummary.account_id == account_id,
                ThreadSummary.thread_id == thread_id,
            )
        )

    async def find_for_message(
        self,
        account_id: UUID,
        email: ParsedEmail,
    ) -> ThreadSummary | None:
        """Resolve thread in header-priority order, then conservative subject fallback."""
        # References usually run oldest -> newest, so prefer the nearest known
        # relationship by checking from the end while keeping References above
        # all other matching strategies.
        for message_id in reversed(email.references):
            thread = await self._find_by_message_id(account_id, message_id)
            if thread is not None:
                return thread

        if email.in_reply_to:
            thread = await self._find_by_message_id(account_id, email.in_reply_to)
            if thread is not None:
                return thread

        if email.message_id:
            thread = await self._find_by_message_id(account_id, email.message_id)
            if thread is not None:
                return thread

        return await self._find_by_subject_and_participants(account_id, email)

    async def _find_by_message_id(
        self,
        account_id: UUID,
        message_id: str,
    ) -> ThreadSummary | None:
        prior_thread_id = await self._session.scalar(
            select(ProcessedEmail.thread_id)
            .where(
                ProcessedEmail.account_id == account_id,
                ProcessedEmail.message_id == message_id,
                ProcessedEmail.thread_id.is_not(None),
            )
            .order_by(ProcessedEmail.processed_at.desc())
            .limit(1)
        )
        if prior_thread_id:
            return await self.get_thread(account_id, prior_thread_id)

        return await self._session.scalar(
            select(ThreadSummary).where(
                ThreadSummary.account_id == account_id,
                ThreadSummary.last_message_id == message_id,
            )
        )

    async def _find_by_subject_and_participants(
        self,
        account_id: UUID,
        email: ParsedEmail,
    ) -> ThreadSummary | None:
        subject_key = email.subject_normalized.strip().casefold()
        if not subject_key:
            return None

        candidates = list(
            (
                await self._session.execute(
                    select(ThreadSummary)
                    .where(
                        ThreadSummary.account_id == account_id,
                        ThreadSummary.subject_key == subject_key,
                    )
                    .order_by(ThreadSummary.last_updated.desc())
                    .limit(5)
                )
            ).scalars()
        )
        current_participants = _participants(email)
        strong = [
            candidate
            for candidate in candidates
            if len(current_participants.intersection(candidate.participants)) >= 2
        ]
        # Ambiguous subject-only matches are deliberately rejected.
        if len(strong) != 1:
            return None
        return strong[0]

    async def create_thread(
        self,
        account_id: UUID,
        email: ParsedEmail,
    ) -> ThreadSummary:
        thread = ThreadSummary(
            account_id=account_id,
            thread_id=str(uuid4()),
            summary="",
            subject_key=email.subject_normalized.strip().casefold(),
            last_message_id=None,
            message_count=0,
            participants=sorted(_participants(email)),
            open_action_required=False,
            deadline=None,
        )
        self._session.add(thread)
        await self._session.flush()
        return thread

    async def apply_message(
        self,
        thread: ThreadSummary,
        email: ParsedEmail,
        summary_update: ThreadSummaryUpdate | None,
    ) -> None:
        """Advance thread metadata and update compact summary only when relevant."""
        participants = set(thread.participants)
        participants.update(_participants(email))
        thread.participants = sorted(participants)
        thread.last_message_id = email.message_id or thread.last_message_id
        thread.last_updated = datetime.now(tz=UTC)
        thread.message_count += 1

        if summary_update is not None:
            if summary_update.changed or not thread.summary:
                thread.summary = summary_update.summary
            thread.open_action_required = summary_update.open_action_required
            thread.deadline = summary_update.deadline


def _participants(email: ParsedEmail) -> set[str]:
    values = {email.from_email.strip().casefold()}
    values.update(address.strip().casefold() for address in email.to_emails)
    return {value for value in values if value}
