"""Operational dashboard and authorization-scoped metadata search endpoints."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity, require_identity
from app.dashboard_schemas import DashboardOverview, MessageSearchResult
from app.database import get_session
from app.services.dashboard import build_dashboard, search_messages

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/overview", response_model=DashboardOverview)
async def dashboard_overview(
    range_days: int = Query(default=7, ge=1, le=30),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> DashboardOverview:
    return await build_dashboard(session, identity, range_days=range_days)


@router.get("/search", response_model=MessageSearchResult)
async def dashboard_search(
    q: str | None = Query(default=None, max_length=500),
    sender: str | None = Query(default=None, max_length=500),
    account_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    category: str | None = Query(default=None, max_length=64),
    subcategory: str | None = Query(default=None, max_length=255),
    importance: str | None = Query(default=None, max_length=32),
    urgency: str | None = Query(default=None, max_length=32),
    action_required: str | None = Query(default=None, max_length=16),
    review_required: bool | None = None,
    suspicious_content: bool | None = None,
    tag: str | None = Query(default=None, max_length=255),
    destination_folder: str | None = Query(default=None, max_length=255),
    classification_source: str | None = Query(
        default=None, pattern="^(decision_memory|fast_model|deep_model)$"
    ),
    processed_state: str | None = Query(default=None, max_length=32),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> MessageSearchResult:
    return await search_messages(
        session,
        identity,
        query=q,
        sender=sender,
        account_id=account_id,
        date_from=date_from,
        date_to=date_to,
        category=category,
        subcategory=subcategory,
        importance=importance,
        urgency=urgency,
        action_required=action_required,
        review_required=review_required,
        suspicious_content=suspicious_content,
        tag=tag,
        destination_folder=destination_folder,
        classification_source=classification_source,
        processed_state=processed_state,
        limit=limit,
        offset=offset,
    )
