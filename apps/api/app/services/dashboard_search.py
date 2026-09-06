"""Authorization-scoped metadata search for MailFlow dashboard."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import cast, func, or_, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity
from app.dashboard_schemas import MessageSearchItem, MessageSearchResult
from app.mailbox_access import access_condition
from app.models.email_account import EmailAccount
from app.models.processed_email import ProcessedEmail
from app.services.dashboard_common import classification_source


@dataclass(frozen=True)
class SearchFilters:
    query: str | None = None
    sender: str | None = None
    subject: str | None = None
    account_id: UUID | None = None
    date_from: date | None = None
    date_to: date | None = None
    category: str | None = None
    subcategory: str | None = None
    importance: str | None = None
    urgency: str | None = None
    action_required: str | None = None
    review_required: bool | None = None
    suspicious_content: bool | None = None
    tag: str | None = None
    destination_folder: str | None = None
    classification_source: str | None = None
    processed_state: str | None = None


def _append_text_predicates(predicates: list, filters: SearchFilters) -> None:
    if filters.query:
        needle = f"%{filters.query.strip()}%"
        predicates.append(
            or_(
                ProcessedEmail.subject.ilike(needle),
                ProcessedEmail.from_email.ilike(needle),
            )
        )
    if filters.sender:
        predicates.append(
            ProcessedEmail.from_email.ilike(f"%{filters.sender.strip()}%")
        )
    if filters.subject:
        predicates.append(ProcessedEmail.subject.ilike(f"%{filters.subject.strip()}%"))


def _append_date_predicates(predicates: list, filters: SearchFilters) -> None:
    if filters.date_from:
        predicates.append(
            ProcessedEmail.processed_at
            >= datetime.combine(filters.date_from, datetime.min.time(), tzinfo=UTC)
        )
    if filters.date_to:
        predicates.append(
            ProcessedEmail.processed_at
            < datetime.combine(
                filters.date_to + timedelta(days=1), datetime.min.time(), tzinfo=UTC
            )
        )


def _append_exact_predicates(predicates: list, filters: SearchFilters) -> None:
    mapping = {
        "category": ProcessedEmail.category,
        "subcategory": ProcessedEmail.subcategory,
        "importance": ProcessedEmail.importance,
        "urgency": ProcessedEmail.urgency,
        "action_required": ProcessedEmail.action_required,
        "destination_folder": ProcessedEmail.destination_folder,
        "processed_state": ProcessedEmail.mailbox_action_status,
    }
    for key, column in mapping.items():
        value = getattr(filters, key)
        if value:
            predicates.append(column == value)


def _append_boolean_predicates(predicates: list, filters: SearchFilters) -> None:
    if filters.review_required is not None:
        predicates.append(ProcessedEmail.review_required.is_(filters.review_required))
    if filters.suspicious_content is not None:
        predicates.append(
            ProcessedEmail.suspicious_content.is_(filters.suspicious_content)
        )


def _append_tag_predicate(predicates: list, tag: str | None) -> None:
    if not tag:
        return
    predicates.append(
        or_(
            cast(ProcessedEmail.system_tags, JSONB).op("?")(tag),
            cast(ProcessedEmail.user_tags, JSONB).op("?")(tag),
        )
    )


def _append_source_predicates(predicates: list, source: str | None) -> None:
    if source == "decision_memory":
        predicates.append(ProcessedEmail.decision_memory_id.is_not(None))
    elif source == "deep_model":
        predicates.extend(
            [
                ProcessedEmail.decision_memory_id.is_(None),
                ProcessedEmail.classification_stage >= 2,
            ]
        )
    elif source == "fast_model":
        predicates.extend(
            [
                ProcessedEmail.decision_memory_id.is_(None),
                or_(
                    ProcessedEmail.classification_stage.is_(None),
                    ProcessedEmail.classification_stage <= 1,
                ),
            ]
        )


def _build_predicates(identity: RequestIdentity, filters: SearchFilters) -> list:
    predicates = [access_condition(identity)]
    if filters.account_id is not None:
        predicates.append(EmailAccount.id == filters.account_id)
    _append_text_predicates(predicates, filters)
    _append_date_predicates(predicates, filters)
    _append_exact_predicates(predicates, filters)
    _append_boolean_predicates(predicates, filters)
    _append_tag_predicate(predicates, filters.tag)
    _append_source_predicates(predicates, filters.classification_source)
    return predicates


def _to_item(row) -> MessageSearchItem:
    message = row.ProcessedEmail
    return MessageSearchItem(
        id=message.id,
        account_id=message.account_id,
        account_label=row.username,
        ownership_mode=row.ownership_mode,
        uid=message.uid,
        folder=message.folder,
        from_email=message.from_email,
        subject=message.subject,
        processed_at=message.processed_at,
        category=message.category,
        subcategory=message.subcategory,
        importance=message.importance,
        urgency=message.urgency,
        action_required=message.action_required,
        review_required=message.review_required,
        suspicious_content=message.suspicious_content,
        system_tags=list(message.system_tags or []),
        user_tags=list(message.user_tags or []),
        destination_folder=message.destination_folder,
        classification_source=classification_source(message),
        processed_state=message.mailbox_action_status,
    )


async def _search(
    session: AsyncSession,
    identity: RequestIdentity,
    filters: SearchFilters,
    limit: int,
    offset: int,
) -> MessageSearchResult:
    predicates = _build_predicates(identity, filters)
    joined = ProcessedEmail.__table__.join(
        EmailAccount.__table__, ProcessedEmail.account_id == EmailAccount.id
    )
    total = int(
        await session.scalar(
            select(func.count(ProcessedEmail.id)).select_from(joined).where(*predicates)
        )
        or 0
    )
    rows = (
        await session.execute(
            select(ProcessedEmail, EmailAccount.username, EmailAccount.ownership_mode)
            .select_from(joined)
            .where(*predicates)
            .order_by(ProcessedEmail.processed_at.desc(), ProcessedEmail.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return MessageSearchResult(
        total=total, limit=limit, offset=offset, items=[_to_item(row) for row in rows]
    )


async def search_messages(
    session: AsyncSession,
    identity: RequestIdentity,
    *,
    query: str | None = None,
    sender: str | None = None,
    subject: str | None = None,
    account_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    category: str | None = None,
    subcategory: str | None = None,
    importance: str | None = None,
    urgency: str | None = None,
    action_required: str | None = None,
    review_required: bool | None = None,
    suspicious_content: bool | None = None,
    tag: str | None = None,
    destination_folder: str | None = None,
    classification_source: str | None = None,
    processed_state: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> MessageSearchResult:
    values = locals().copy()
    values.pop("session")
    values.pop("identity")
    values.pop("limit")
    values.pop("offset")
    return await _search(session, identity, SearchFilters(**values), limit, offset)
