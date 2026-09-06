"""Organization-scoped LLM provider CRUD endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_org, require_org_admin
from app.crypto import encrypt_secret
from app.database import get_session
from app.llm_schemas import LLMProviderCreate, LLMProviderOut, LLMProviderUpdate
from app.models.llm_provider import LLMProvider
from app.models.organization import Organization

router = APIRouter(prefix="/llm-providers", tags=["llm-providers"])


def _encrypt_api_key(value: str | None) -> str | None:
    return encrypt_secret({"api_key": value}) if value else None


def _to_out(provider: LLMProvider) -> LLMProviderOut:
    out = LLMProviderOut.model_validate(provider)
    out.has_api_key = provider.encrypted_api_key is not None
    out.has_fast_api_key = provider.encrypted_fast_api_key is not None
    out.has_deep_api_key = provider.encrypted_deep_api_key is not None
    out.has_generation_api_key = provider.encrypted_generation_api_key is not None
    return out


async def _get_owned(
    provider_id: UUID, org: Organization, session: AsyncSession
) -> LLMProvider:
    provider = (
        await session.execute(
            select(LLMProvider).where(
                LLMProvider.id == provider_id, LLMProvider.org_id == org.id
            )
        )
    ).scalar_one_or_none()
    if provider is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="llm_provider_not_found"
        )
    return provider


@router.get("", response_model=list[LLMProviderOut])
async def list_providers(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    org: Organization = Depends(require_org),
    session: AsyncSession = Depends(get_session),
) -> list[LLMProviderOut]:
    rows = await session.execute(
        select(LLMProvider)
        .where(LLMProvider.org_id == org.id)
        .order_by(LLMProvider.created_at)
        .limit(limit)
        .offset(offset)
    )
    return [_to_out(provider) for provider in rows.scalars()]


@router.post("", response_model=LLMProviderOut, status_code=status.HTTP_201_CREATED)
async def create_provider(
    payload: LLMProviderCreate,
    org: Organization = Depends(require_org_admin),
    session: AsyncSession = Depends(get_session),
) -> LLMProviderOut:
    compatibility_classification = (
        payload.default_classification_model
        or payload.fast_classification_model
        or payload.deep_classification_model
    )
    if not compatibility_classification:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="classification_model_required",
        )
    compatibility_generation = (
        payload.default_generation_model
        or payload.generation_model
        or compatibility_classification
    )

    provider = LLMProvider(
        org_id=org.id,
        label=payload.label,
        type=payload.type,
        base_url=payload.base_url,
        encrypted_api_key=_encrypt_api_key(payload.api_key),
        default_classification_model=compatibility_classification,
        default_generation_model=compatibility_generation,
        fast_classification_model=payload.fast_classification_model,
        deep_classification_model=payload.deep_classification_model,
        generation_model=payload.generation_model,
        fast_classification_base_url=payload.fast_classification_base_url,
        deep_classification_base_url=payload.deep_classification_base_url,
        generation_base_url=payload.generation_base_url,
        encrypted_fast_api_key=_encrypt_api_key(payload.fast_api_key),
        encrypted_deep_api_key=_encrypt_api_key(payload.deep_api_key),
        encrypted_generation_api_key=_encrypt_api_key(payload.generation_api_key),
    )
    session.add(provider)
    await session.commit()
    await session.refresh(provider)
    return _to_out(provider)


@router.get("/{provider_id}", response_model=LLMProviderOut)
async def get_provider(
    provider_id: UUID,
    org: Organization = Depends(require_org),
    session: AsyncSession = Depends(get_session),
) -> LLMProviderOut:
    return _to_out(await _get_owned(provider_id, org, session))


@router.patch("/{provider_id}", response_model=LLMProviderOut)
async def update_provider(
    provider_id: UUID,
    payload: LLMProviderUpdate,
    org: Organization = Depends(require_org_admin),
    session: AsyncSession = Depends(get_session),
) -> LLMProviderOut:
    provider = await _get_owned(provider_id, org, session)
    data = payload.model_dump(exclude_unset=True)

    secret_fields = {
        "api_key": "encrypted_api_key",
        "fast_api_key": "encrypted_fast_api_key",
        "deep_api_key": "encrypted_deep_api_key",
        "generation_api_key": "encrypted_generation_api_key",
    }
    for input_name, storage_name in secret_fields.items():
        if input_name in data:
            setattr(provider, storage_name, _encrypt_api_key(data.pop(input_name)))

    for field, value in data.items():
        if field in {"default_classification_model", "default_generation_model"}:
            if value is not None:
                setattr(provider, field, value)
            continue
        setattr(provider, field, value)

    await session.commit()
    await session.refresh(provider)
    return _to_out(provider)


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_provider(
    provider_id: UUID,
    org: Organization = Depends(require_org_admin),
    session: AsyncSession = Depends(get_session),
) -> None:
    provider = await _get_owned(provider_id, org, session)
    await session.delete(provider)
    await session.commit()
