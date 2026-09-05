"""Attention-state derivation without extra LLM calls."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from mailflow_core.types import ClassificationResult
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.attention_schemas import (
    AttentionCounters,
    DailySummary,
    DailySummaryItem,
    NotificationCenter,
    NotificationPreferenceView,
    NotificationView,
    ReviewCorrection,
    ReviewInbox,
    ReviewItem,
)
from app.auth import RequestIdentity
from app.mailbox_access import access_condition, get_accessible_account
from app.models.attention import NotificationEvent, NotificationPreference
from app.models.email_account import EmailAccount
from app.models.processed_email import ProcessedEmail
from app.repositories.decision_memory import DecisionMemoryRepository

REVIEW_CONFIDENCE_THRESHOLD = 0.75
_SINGLE_USER_KEY = "__single__"


def actor_key(identity: RequestIdentity) -> str:
    return identity.user_id or _SINGLE_USER_KEY


def _is_failure(row: ProcessedEmail) -> bool:
    return row.mailbox_action_status in {"blocked", "failed", "error"}


def _needs_attention(row: ProcessedEmail) -> bool:
    return bool(
        row.suspicious_content
        or row.review_required
        or row.action_review_required
        or row.needs_more_context
        or row.confidence < REVIEW_CONFIDENCE_THRESHOLD
        or row.urgency in {"immediate", "today"}
        or row.action_required == "yes"
        or _is_failure(row)
    )


def _review_reason(row: ProcessedEmail) -> tuple[str, int, str]:
    if row.suspicious_content:
        return "security", 100, row.reason or "Suspicious or security-sensitive message"
    if row.urgency == "immediate" or row.importance == "critical":
        return "urgent", 90, row.reason or "Urgent message needs attention"
    if row.action_required == "yes":
        return "action_required", 85, row.reason or "Action required"
    if _is_failure(row):
        return "action_failure", 75, row.mailbox_action_reason or "Mailbox action failed or was blocked"
    if row.action_review_required:
        return "routing_review", 70, row.mailbox_action_reason or "Proposed mailbox action needs approval"
    if row.needs_more_context:
        return "unresolved", 60, row.reason or "Classification needs more context"
    if row.review_required or row.confidence < REVIEW_CONFIDENCE_THRESHOLD:
        return "classification_review", 50, row.reason or "Classification needs review"
    return "attention", 40, row.reason or "Needs attention"


def _review_item(row: ProcessedEmail, account: EmailAccount) -> ReviewItem:
    review_type, priority, reason = _review_reason(row)
    return ReviewItem(
        id=row.id,
        account_id=row.account_id,
        account_label=account.username,
        ownership_mode=account.ownership_mode,
        uid=row.uid,
        folder=row.folder,
        thread_id=row.thread_id,
        subject=row.subject,
        from_email=row.from_email,
        category=row.category,
        subcategory=row.subcategory,
        importance=row.importance,
        urgency=row.urgency,
        action_required=row.action_required,
        confidence=row.confidence,
        reason=reason,
        review_type=review_type,
        priority=priority,
        destination_folder=row.destination_folder,
        system_tags=list(row.system_tags or []),
        user_tags=list(row.user_tags or []),
        suspicious_content=row.suspicious_content,
        action_review_required=row.action_review_required,
        processed_at=row.processed_at,
    )


async def _authorized_rows(
    session: AsyncSession,
    identity: RequestIdentity,
    *,
    since: datetime | None = None,
    account_id: UUID | None = None,
) -> list[tuple[ProcessedEmail, EmailAccount]]:
    stmt = (
        select(ProcessedEmail, EmailAccount)
        .join(EmailAccount, EmailAccount.id == ProcessedEmail.account_id)
        .where(access_condition(identity))
    )
    if since is not None:
        stmt = stmt.where(ProcessedEmail.processed_at >= since)
    if account_id is not None:
        stmt = stmt.where(ProcessedEmail.account_id == account_id)
    rows = await session.execute(stmt.order_by(ProcessedEmail.processed_at.desc()))
    return list(rows.all())


def _counters(rows: list[tuple[ProcessedEmail, EmailAccount]], unread: int = 0) -> AttentionCounters:
    return AttentionCounters(
        urgent=sum(1 for row, _ in rows if row.urgency in {"immediate", "today"}),
        action_required=sum(1 for row, _ in rows if row.action_required == "yes"),
        review_needed=sum(1 for row, _ in rows if _needs_attention(row)),
        failures=sum(1 for row, _ in rows if _is_failure(row)),
        security=sum(1 for row, _ in rows if row.suspicious_content),
        unread_notifications=unread,
    )


async def list_review_items(
    session: AsyncSession,
    identity: RequestIdentity,
    *,
    account_id: UUID | None = None,
    category: str | None = None,
    urgency: str | None = None,
    importance: str | None = None,
    reason: str | None = None,
    ownership_mode: str | None = None,
    limit: int = 100,
) -> ReviewInbox:
    rows = await _authorized_rows(session, identity, account_id=account_id)
    attention = [(row, account) for row, account in rows if _needs_attention(row)]
    items = [_review_item(row, account) for row, account in attention]
    if category:
        items = [item for item in items if item.category == category]
    if urgency:
        items = [item for item in items if item.urgency == urgency]
    if importance:
        items = [item for item in items if item.importance == importance]
    if reason:
        items = [item for item in items if item.review_type == reason]
    if ownership_mode:
        items = [item for item in items if item.ownership_mode == ownership_mode]
    items.sort(key=lambda item: (-item.priority, -item.processed_at.timestamp()))
    return ReviewInbox(items=items[:limit], counters=_counters(attention))


async def correct_review_item(
    session: AsyncSession,
    identity: RequestIdentity,
    item_id: UUID,
    payload: ReviewCorrection,
) -> ReviewItem | None:
    row = await session.scalar(select(ProcessedEmail).where(ProcessedEmail.id == item_id))
    if row is None:
        return None
    account = await get_accessible_account(row.account_id, identity, session)

    changed_classification = False
    for field in ("category", "subcategory", "importance", "urgency", "action_required", "destination_folder"):
        value = getattr(payload, field)
        if value is not None and getattr(row, field) != value:
            setattr(row, field, value)
            changed_classification = True
    if payload.system_tags is not None:
        row.system_tags = list(payload.system_tags)
        changed_classification = True
    if payload.user_tags is not None:
        row.user_tags = list(payload.user_tags)
        changed_classification = True

    if payload.routing_decision == "approve":
        row.action_review_required = False
        row.mailbox_action_status = "execute"
    elif payload.routing_decision == "reject":
        row.action_review_required = False
        row.mailbox_action_status = "none"
        row.mailbox_action_reason = "rejected_by_user"

    if payload.dismiss or changed_classification or payload.routing_decision:
        row.review_required = False
        row.needs_more_context = False
        if not row.suspicious_content or payload.dismiss:
            row.suspicious_content = False

    if changed_classification and payload.remember:
        classification = ClassificationResult(
            label=row.category,
            category=row.category,
            subcategory=row.subcategory,
            importance=row.importance,
            urgency=row.urgency,
            action_required=row.action_required,
            system_tags=tuple(row.system_tags or ()),
            user_tags=tuple(row.user_tags or ()),
            confidence=1.0,
            method="fallback",
            review_required=False,
        )
        sender = row.from_email.strip().lower()
        domain = sender.rsplit("@", 1)[1] if "@" in sender else None
        memory = await DecisionMemoryRepository(session).create_entry(
            account_id=row.account_id,
            sender_email=sender or None,
            sender_domain=domain,
            subject_pattern=None,
            thread_id=row.thread_id,
            classification=classification,
            routing_target=row.destination_folder,
            source="human_corrected",
            trust_score=1.0,
        )
        row.decision_memory_id = memory.id
        row.decision_memory_match_confidence = 1.0
        row.decision_memory_hint_used = False

    now = datetime.now(tz=UTC)
    await session.execute(
        select(NotificationEvent).where(
            NotificationEvent.org_id == identity.org.id,
            NotificationEvent.user_key == actor_key(identity),
            NotificationEvent.source_email_id == row.id,
        )
    )
    events = list(
        (
            await session.execute(
                select(NotificationEvent).where(
                    NotificationEvent.org_id == identity.org.id,
                    NotificationEvent.user_key == actor_key(identity),
                    NotificationEvent.source_email_id == row.id,
                    NotificationEvent.resolved_at.is_(None),
                )
            )
        ).scalars()
    )
    for event in events:
        event.resolved_at = now
    await session.commit()
    if not _needs_attention(row):
        return None
    return _review_item(row, account)


async def get_preferences(session: AsyncSession, identity: RequestIdentity) -> NotificationPreferenceView:
    pref = await session.scalar(
        select(NotificationPreference).where(
            NotificationPreference.org_id == identity.org.id,
            NotificationPreference.user_key == actor_key(identity),
        )
    )
    if pref is None:
        return NotificationPreferenceView()
    return NotificationPreferenceView(
        urgent_enabled=pref.urgent_enabled,
        security_review_enabled=pref.security_review_enabled,
        jobs_enabled=pref.jobs_enabled,
        mailbox_health_enabled=pref.mailbox_health_enabled,
        daily_summary_enabled=pref.daily_summary_enabled,
        daily_summary_hour=pref.daily_summary_hour,
        timezone=pref.timezone,
    )


async def update_preferences(
    session: AsyncSession,
    identity: RequestIdentity,
    payload: NotificationPreferenceView,
) -> NotificationPreferenceView:
    pref = await session.scalar(
        select(NotificationPreference).where(
            NotificationPreference.org_id == identity.org.id,
            NotificationPreference.user_key == actor_key(identity),
        )
    )
    if pref is None:
        pref = NotificationPreference(org_id=identity.org.id, user_key=actor_key(identity))
        session.add(pref)
    for field, value in payload.model_dump().items():
        setattr(pref, field, value)
    pref.updated_at = datetime.now(tz=UTC)
    await session.commit()
    return payload


def _notification_specs(row: ProcessedEmail, pref: NotificationPreferenceView) -> list[tuple[str, str, str, str]]:
    specs: list[tuple[str, str, str, str]] = []
    if row.suspicious_content and pref.security_review_enabled:
        specs.append(("security_review", "critical", "Security review required", row.subject or "Suspicious message"))
    elif (row.review_required or row.action_review_required) and pref.security_review_enabled:
        specs.append(("review_required", "warning", "Review required", row.subject or "Message needs review"))
    if pref.urgent_enabled and (row.urgency in {"immediate", "today"} or row.action_required == "yes"):
        specs.append(("urgent_action", "warning", "Action needed", row.subject or "Urgent message"))
    if pref.security_review_enabled and _is_failure(row):
        specs.append(("action_failure", "warning", "Mailbox action failed", row.subject or "Action failed"))
    return specs


async def materialize_notifications(session: AsyncSession, identity: RequestIdentity) -> None:
    pref = await get_preferences(session, identity)
    since = datetime.now(tz=UTC) - timedelta(days=7)
    rows = await _authorized_rows(session, identity, since=since)
    existing = set(
        (
            await session.execute(
                select(NotificationEvent.dedupe_key).where(
                    NotificationEvent.org_id == identity.org.id,
                    NotificationEvent.user_key == actor_key(identity),
                )
            )
        ).scalars()
    )
    for row, _account in rows:
        for event_type, severity, title, body in _notification_specs(row, pref):
            key = f"email:{row.id}:{event_type}"
            if key in existing:
                continue
            session.add(
                NotificationEvent(
                    org_id=identity.org.id,
                    user_key=actor_key(identity),
                    account_id=row.account_id,
                    source_email_id=row.id,
                    event_type=event_type,
                    severity=severity,
                    title=title,
                    body=body[:500],
                    dedupe_key=key,
                    metadata_json={"uid": row.uid, "folder": row.folder, "thread_id": row.thread_id},
                )
            )
            existing.add(key)
    await session.commit()


async def list_notifications(
    session: AsyncSession,
    identity: RequestIdentity,
    *,
    include_resolved: bool = False,
    limit: int = 100,
) -> NotificationCenter:
    await materialize_notifications(session, identity)
    stmt = select(NotificationEvent).where(
        NotificationEvent.org_id == identity.org.id,
        NotificationEvent.user_key == actor_key(identity),
    )
    if not include_resolved:
        stmt = stmt.where(NotificationEvent.resolved_at.is_(None))
    events = list((await session.execute(stmt.order_by(NotificationEvent.created_at.desc()).limit(limit))).scalars())
    unread = sum(1 for event in events if event.read_at is None)
    rows = await _authorized_rows(session, identity)
    views = [
        NotificationView(
            id=event.id,
            account_id=event.account_id,
            event_type=event.event_type,
            severity=event.severity,
            title=event.title,
            body=event.body,
            read_at=event.read_at,
            resolved_at=event.resolved_at,
            created_at=event.created_at,
            metadata=event.metadata_json or {},
        )
        for event in events
    ]
    return NotificationCenter(notifications=views, unread=unread, counters=_counters(rows, unread))


async def mark_notification_read(
    session: AsyncSession, identity: RequestIdentity, notification_id: UUID
) -> bool:
    event = await session.scalar(
        select(NotificationEvent).where(
            NotificationEvent.id == notification_id,
            NotificationEvent.org_id == identity.org.id,
            NotificationEvent.user_key == actor_key(identity),
        )
    )
    if event is None:
        return False
    if event.read_at is None:
        event.read_at = datetime.now(tz=UTC)
        await session.commit()
    return True


def _summary_item(row: ProcessedEmail, account: EmailAccount) -> DailySummaryItem:
    return DailySummaryItem(
        account_id=row.account_id,
        account_label=account.username,
        message_id=row.id,
        subject=row.subject,
        from_email=row.from_email,
        category=row.category,
        importance=row.importance,
        urgency=row.urgency,
        action_required=row.action_required,
        reason=row.reason or row.mailbox_action_reason,
    )


async def build_daily_summary(
    session: AsyncSession,
    identity: RequestIdentity,
    *,
    hours: int = 24,
) -> DailySummary:
    now = datetime.now(tz=UTC)
    since = now - timedelta(hours=hours)
    rows = await _authorized_rows(session, identity, since=since)
    return DailySummary(
        generated_at=now,
        since=since,
        counters=_counters(rows),
        urgent=[_summary_item(row, account) for row, account in rows if row.urgency in {"immediate", "today"}][:20],
        action_required=[_summary_item(row, account) for row, account in rows if row.action_required == "yes"][:20],
        awaiting_review=[_summary_item(row, account) for row, account in rows if _needs_attention(row)][:20],
        important_new=[_summary_item(row, account) for row, account in rows if row.importance in {"critical", "high"}][:20],
        failures=[_summary_item(row, account) for row, account in rows if _is_failure(row)][:20],
    )
