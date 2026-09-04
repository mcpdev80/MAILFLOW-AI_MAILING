"""Persistence boundary for mailbox-scoped DecisionMemory entries."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from mailflow_core.decision_memory import DecisionMemoryCandidate
from mailflow_core.types import ClassificationResult, ParsedEmail
from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.decision_memory import DecisionMemoryEntry


class DecisionMemoryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_entries(
        self, account_id: UUID, *, include_disabled: bool = True
    ) -> list[DecisionMemoryEntry]:
        stmt = select(DecisionMemoryEntry).where(
            DecisionMemoryEntry.account_id == account_id
        )
        if not include_disabled:
            stmt = stmt.where(DecisionMemoryEntry.enabled.is_(True))
        rows = await self._session.execute(
            stmt.order_by(
                DecisionMemoryEntry.updated_at.desc(),
                DecisionMemoryEntry.created_at.desc(),
            )
        )
        return list(rows.scalars())

    async def get_entry(
        self, account_id: UUID, entry_id: UUID
    ) -> DecisionMemoryEntry | None:
        return (
            await self._session.execute(
                select(DecisionMemoryEntry).where(
                    DecisionMemoryEntry.id == entry_id,
                    DecisionMemoryEntry.account_id == account_id,
                )
            )
        ).scalar_one_or_none()

    async def candidates_for_email(
        self, account_id: UUID, email: ParsedEmail
    ) -> tuple[DecisionMemoryCandidate, ...]:
        sender = email.from_email.strip().lower()
        domain = email.from_domain.strip().lower()
        predicates = []
        if sender:
            predicates.append(DecisionMemoryEntry.sender_email == sender)
        if domain:
            predicates.append(DecisionMemoryEntry.sender_domain == domain)
        if email.thread_id:
            predicates.append(DecisionMemoryEntry.thread_id == email.thread_id)
        if not predicates:
            return ()

        rows = await self._session.execute(
            select(DecisionMemoryEntry)
            .where(
                DecisionMemoryEntry.account_id == account_id,
                DecisionMemoryEntry.enabled.is_(True),
                or_(*predicates),
            )
            .order_by(DecisionMemoryEntry.updated_at.desc())
            .limit(100)
        )
        return tuple(_to_candidate(row) for row in rows.scalars())

    async def create_entry(
        self,
        *,
        account_id: UUID,
        sender_email: str | None,
        sender_domain: str | None,
        subject_pattern: str | None,
        thread_id: str | None,
        classification: ClassificationResult,
        routing_target: str | None,
        source: str,
        trust_score: float,
    ) -> DecisionMemoryEntry:
        entry = DecisionMemoryEntry(
            account_id=account_id,
            sender_email=_clean_lower(sender_email),
            sender_domain=_clean_lower(sender_domain),
            subject_pattern=_clean(subject_pattern),
            thread_id=_clean(thread_id),
            category=classification.category,
            subcategory=classification.subcategory,
            importance=classification.importance,
            urgency=classification.urgency,
            action_required=classification.action_required,
            system_tags=list(classification.system_tags),
            user_tags=list(classification.user_tags),
            routing_target=_clean(routing_target),
            source=source,
            trust_score=trust_score,
            enabled=True,
        )
        self._session.add(entry)
        await self._session.flush()
        await self._supersede_conflicts(entry)
        return entry

    async def update_entry(
        self,
        entry: DecisionMemoryEntry,
        *,
        sender_email: str | None,
        sender_domain: str | None,
        subject_pattern: str | None,
        thread_id: str | None,
        classification: ClassificationResult,
        routing_target: str | None,
        source: str,
        trust_score: float,
        enabled: bool,
    ) -> DecisionMemoryEntry:
        entry.sender_email = _clean_lower(sender_email)
        entry.sender_domain = _clean_lower(sender_domain)
        entry.subject_pattern = _clean(subject_pattern)
        entry.thread_id = _clean(thread_id)
        entry.category = classification.category
        entry.subcategory = classification.subcategory
        entry.importance = classification.importance
        entry.urgency = classification.urgency
        entry.action_required = classification.action_required
        entry.system_tags = list(classification.system_tags)
        entry.user_tags = list(classification.user_tags)
        entry.routing_target = _clean(routing_target)
        entry.source = source
        entry.trust_score = trust_score
        entry.enabled = enabled
        entry.updated_at = datetime.now(tz=UTC)
        await self._session.flush()
        if enabled:
            await self._supersede_conflicts(entry)
        return entry

    async def delete_entry(self, entry: DecisionMemoryEntry) -> None:
        await self._session.delete(entry)

    async def mark_used(self, account_id: UUID, entry_id: UUID) -> None:
        await self._session.execute(
            update(DecisionMemoryEntry)
            .where(
                DecisionMemoryEntry.id == entry_id,
                DecisionMemoryEntry.account_id == account_id,
                DecisionMemoryEntry.enabled.is_(True),
            )
            .values(
                hit_count=DecisionMemoryEntry.hit_count + 1,
                last_used=datetime.now(tz=UTC),
            )
        )

    async def _supersede_conflicts(self, new_entry: DecisionMemoryEntry) -> None:
        """Disable older trusted entries with the same matching identity but a new decision."""
        if new_entry.source not in {"human_confirmed", "human_corrected"}:
            return
        same_identity = and_(
            DecisionMemoryEntry.account_id == new_entry.account_id,
            DecisionMemoryEntry.id != new_entry.id,
            DecisionMemoryEntry.enabled.is_(True),
            DecisionMemoryEntry.sender_email.is_not_distinct_from(
                new_entry.sender_email
            ),
            DecisionMemoryEntry.sender_domain.is_not_distinct_from(
                new_entry.sender_domain
            ),
            DecisionMemoryEntry.subject_pattern.is_not_distinct_from(
                new_entry.subject_pattern
            ),
            DecisionMemoryEntry.thread_id.is_not_distinct_from(new_entry.thread_id),
            DecisionMemoryEntry.source.in_(["human_confirmed", "human_corrected"]),
        )
        conflict = or_(
            DecisionMemoryEntry.category != new_entry.category,
            DecisionMemoryEntry.subcategory.is_distinct_from(new_entry.subcategory),
            DecisionMemoryEntry.importance != new_entry.importance,
            DecisionMemoryEntry.urgency != new_entry.urgency,
            DecisionMemoryEntry.action_required != new_entry.action_required,
            DecisionMemoryEntry.routing_target.is_distinct_from(
                new_entry.routing_target
            ),
        )
        await self._session.execute(
            update(DecisionMemoryEntry)
            .where(same_identity, conflict)
            .values(enabled=False, superseded_by_id=new_entry.id)
        )


def _to_candidate(entry: DecisionMemoryEntry) -> DecisionMemoryCandidate:
    result = ClassificationResult(
        label=entry.category,
        category=entry.category,
        subcategory=entry.subcategory,
        importance=entry.importance,
        urgency=entry.urgency,
        action_required=entry.action_required,
        system_tags=tuple(entry.system_tags or ()),
        user_tags=tuple(entry.user_tags or ()),
        confidence=entry.trust_score,
        method="decision_memory",
        review_required=False,
    )
    return DecisionMemoryCandidate(
        entry_id=str(entry.id),
        account_id=str(entry.account_id),
        sender_email=entry.sender_email,
        sender_domain=entry.sender_domain,
        subject_pattern=entry.subject_pattern,
        thread_id=entry.thread_id,
        result=result,
        source=entry.source,
        trust_score=entry.trust_score,
        enabled=entry.enabled,
        updated_at=entry.updated_at,
    )


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _clean_lower(value: str | None) -> str | None:
    cleaned = _clean(value)
    return cleaned.lower() if cleaned else None
