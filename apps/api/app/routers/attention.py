"""Unified attention-center routes."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.attention_schemas import (
    DailySummary,
    NotificationCenter,
    NotificationPreferenceView,
    ReviewCorrection,
    ReviewInbox,
    ReviewItem,
)
from app.auth import RequestIdentity, require_identity
from app.database import get_session
from app.services.attention import (
    build_daily_summary,
    correct_review_item,
    get_preferences,
    list_notifications,
    mark_notification_read,
    update_preferences,
)
from app.services.attention_jobs import materialize_operational_notifications
from app.services.attention_review import build_review_inbox

router = APIRouter(prefix="/attention", tags=["attention"])


@router.get("/review", response_model=ReviewInbox)
async def review_inbox(
    account_id: UUID | None = None,
    category: str | None = Query(default=None, max_length=64),
    urgency: str | None = Query(default=None, max_length=32),
    importance: str | None = Query(default=None, max_length=32),
    reason: str | None = Query(default=None, max_length=64),
    ownership_mode: str | None = Query(default=None, pattern="^(private|shared)$"),
    limit: int = Query(default=100, ge=1, le=200),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> ReviewInbox:
    return await build_review_inbox(
        session,
        identity,
        account_id=account_id,
        category=category,
        urgency=urgency,
        importance=importance,
        reason=reason,
        ownership_mode=ownership_mode,
        limit=limit,
    )


@router.patch("/review/{item_id}", response_model=ReviewItem)
async def update_review_item(
    item_id: UUID,
    payload: ReviewCorrection,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> ReviewItem | Response:
    item = await correct_review_item(session, identity, item_id, payload)
    if item is None:
        # Resolved and inaccessible/missing UUIDs both disappear without exposing
        # whether another user's review item exists.
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return item


@router.get("/notifications", response_model=NotificationCenter)
async def notification_center(
    include_resolved: bool = False,
    limit: int = Query(default=100, ge=1, le=200),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> NotificationCenter:
    preferences = await get_preferences(session, identity)
    await materialize_operational_notifications(session, identity, preferences)
    return await list_notifications(
        session,
        identity,
        include_resolved=include_resolved,
        limit=limit,
    )


@router.post("/notifications/{notification_id}/read", status_code=204)
async def read_notification(
    notification_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> Response:
    found = await mark_notification_read(session, identity, notification_id)
    if not found:
        raise HTTPException(status_code=404, detail="notification_not_found")
    return Response(status_code=204)


@router.get("/preferences", response_model=NotificationPreferenceView)
async def notification_preferences(
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> NotificationPreferenceView:
    return await get_preferences(session, identity)


@router.put("/preferences", response_model=NotificationPreferenceView)
async def save_notification_preferences(
    payload: NotificationPreferenceView,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> NotificationPreferenceView:
    return await update_preferences(session, identity, payload)


@router.get("/daily-summary", response_model=DailySummary)
async def daily_summary(
    hours: int = Query(default=24, ge=1, le=168),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> DailySummary:
    preferences = await get_preferences(session, identity)
    if not preferences.daily_summary_enabled:
        raise HTTPException(status_code=404, detail="daily_summary_disabled")
    return await build_daily_summary(session, identity, hours=hours)
