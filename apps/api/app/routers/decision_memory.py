"""Mailbox-scoped DecisionMemory inspection and management endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from mailflow_core.types import ClassificationResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity, require_identity
from app.database import get_session
from app.decision_memory_schemas import DecisionMemoryOut, DecisionMemoryWrite
from app.mailbox_access import get_accessible_account, get_account_for_management
from app.repositories.decision_memory import DecisionMemoryRepository

router = APIRouter(
    prefix="/accounts/{account_id}/decision-memory", tags=["decision-memory"]
)


def _classification(payload: DecisionMemoryWrite) -> ClassificationResult:
    try:
        return ClassificationResult(
            label=payload.category,
            confidence=payload.trust_score,
            method="decision_memory",
            category=payload.category,
            subcategory=payload.subcategory,
            importance=payload.importance,
            urgency=payload.urgency,
            action_required=payload.action_required,
            system_tags=tuple(payload.system_tags),
            user_tags=tuple(payload.user_tags),
            review_required=False,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("", response_model=list[DecisionMemoryOut])
async def list_decision_memory(
    account_id: UUID,
    include_disabled: bool = True,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[object]:
    await get_accessible_account(account_id, identity, session)
    return list(
        await DecisionMemoryRepository(session).list_entries(
            account_id, include_disabled=include_disabled
        )
    )


@router.post("", response_model=DecisionMemoryOut, status_code=status.HTTP_201_CREATED)
async def create_decision_memory(
    account_id: UUID,
    payload: DecisionMemoryWrite,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> object:
    await get_account_for_management(account_id, identity, session)
    classification = _classification(payload)
    repo = DecisionMemoryRepository(session)
    entry = await repo.create_entry(
        account_id=account_id,
        sender_email=payload.sender_email,
        sender_domain=payload.sender_domain,
        subject_pattern=payload.subject_pattern,
        thread_id=payload.thread_id,
        classification=classification,
        routing_target=payload.routing_target,
        source=payload.source,
        trust_score=payload.trust_score,
    )
    entry.enabled = payload.enabled
    await session.commit()
    await session.refresh(entry)
    return entry


@router.put("/{entry_id}", response_model=DecisionMemoryOut)
async def replace_decision_memory(
    account_id: UUID,
    entry_id: UUID,
    payload: DecisionMemoryWrite,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> object:
    await get_account_for_management(account_id, identity, session)
    repo = DecisionMemoryRepository(session)
    entry = await repo.get_entry(account_id, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="decision_memory_not_found")
    entry = await repo.update_entry(
        entry,
        sender_email=payload.sender_email,
        sender_domain=payload.sender_domain,
        subject_pattern=payload.subject_pattern,
        thread_id=payload.thread_id,
        classification=_classification(payload),
        routing_target=payload.routing_target,
        source=payload.source,
        trust_score=payload.trust_score,
        enabled=payload.enabled,
    )
    await session.commit()
    await session.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_decision_memory(
    account_id: UUID,
    entry_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> None:
    await get_account_for_management(account_id, identity, session)
    repo = DecisionMemoryRepository(session)
    entry = await repo.get_entry(account_id, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="decision_memory_not_found")
    await repo.delete_entry(entry)
    await session.commit()
