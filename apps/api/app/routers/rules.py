"""Classification-rule endpoints scoped to an authorized mailbox."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity, require_identity
from app.database import get_session
from app.mailbox_access import get_accessible_account
from app.models.rules import DomainRule, InternalDomain, KeywordRule
from app.schemas import (
    DomainRuleCreate,
    DomainRuleOut,
    InternalDomainCreate,
    InternalDomainOut,
    KeywordRuleCreate,
    KeywordRuleOut,
)

router = APIRouter(prefix="/accounts/{account_id}", tags=["rules"])


async def _assert_account_access(
    account_id: UUID, identity: RequestIdentity, session: AsyncSession
) -> None:
    await get_accessible_account(account_id, identity, session)


@router.get("/domain-rules", response_model=list[DomainRuleOut])
async def list_domain_rules(
    account_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[DomainRule]:
    await _assert_account_access(account_id, identity, session)
    rows = await session.execute(
        select(DomainRule)
        .where(DomainRule.account_id == account_id)
        .order_by(DomainRule.priority)
    )
    return list(rows.scalars())


@router.post(
    "/domain-rules", response_model=DomainRuleOut, status_code=status.HTTP_201_CREATED
)
async def create_domain_rule(
    account_id: UUID,
    payload: DomainRuleCreate,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> DomainRule:
    await _assert_account_access(account_id, identity, session)
    rule = DomainRule(account_id=account_id, **payload.model_dump())
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


@router.delete("/domain-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_domain_rule(
    account_id: UUID,
    rule_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> None:
    await _assert_account_access(account_id, identity, session)
    rule = (
        await session.execute(
            select(DomainRule).where(
                DomainRule.id == rule_id, DomainRule.account_id == account_id
            )
        )
    ).scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="rule_not_found")
    await session.delete(rule)
    await session.commit()


@router.get("/keyword-rules", response_model=list[KeywordRuleOut])
async def list_keyword_rules(
    account_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[KeywordRule]:
    await _assert_account_access(account_id, identity, session)
    rows = await session.execute(
        select(KeywordRule)
        .where(KeywordRule.account_id == account_id)
        .order_by(KeywordRule.priority)
    )
    return list(rows.scalars())


@router.post(
    "/keyword-rules", response_model=KeywordRuleOut, status_code=status.HTTP_201_CREATED
)
async def create_keyword_rule(
    account_id: UUID,
    payload: KeywordRuleCreate,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> KeywordRule:
    await _assert_account_access(account_id, identity, session)
    rule = KeywordRule(account_id=account_id, **payload.model_dump())
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


@router.delete("/keyword-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_keyword_rule(
    account_id: UUID,
    rule_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> None:
    await _assert_account_access(account_id, identity, session)
    rule = (
        await session.execute(
            select(KeywordRule).where(
                KeywordRule.id == rule_id, KeywordRule.account_id == account_id
            )
        )
    ).scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="rule_not_found")
    await session.delete(rule)
    await session.commit()


@router.get("/internal-domains", response_model=list[InternalDomainOut])
async def list_internal_domains(
    account_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[InternalDomain]:
    await _assert_account_access(account_id, identity, session)
    rows = await session.execute(
        select(InternalDomain).where(InternalDomain.account_id == account_id)
    )
    return list(rows.scalars())


@router.post(
    "/internal-domains",
    response_model=InternalDomainOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_internal_domain(
    account_id: UUID,
    payload: InternalDomainCreate,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> InternalDomain:
    await _assert_account_access(account_id, identity, session)
    row = InternalDomain(account_id=account_id, domain=payload.domain)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.delete("/internal-domains/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_internal_domain(
    account_id: UUID,
    domain_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> None:
    await _assert_account_access(account_id, identity, session)
    row = (
        await session.execute(
            select(InternalDomain).where(
                InternalDomain.id == domain_id,
                InternalDomain.account_id == account_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="domain_not_found")
    await session.delete(row)
    await session.commit()
