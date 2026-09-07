"""Internal LLM control plane used only by the authenticated instance-admin BFF."""

from __future__ import annotations

import asyncio
import json
import secrets
from typing import Any
from urllib.error import HTTPError, URLError
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.crypto import encrypt_secret
from app.database import get_session
from app.llm_schemas import LLMModelDiscoveryRequest
from app.models.llm_provider import LLMProvider
from app.routers.llm_providers import _discover_models

router = APIRouter(prefix="/internal/instance-llm", tags=["internal-instance-llm"])


class ProviderWrite(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    type: str = Field(min_length=1, max_length=50)
    base_url: str = Field(min_length=1, max_length=500)
    api_key: str | None = None
    seed_model: str | None = Field(default=None, max_length=200)
    is_active: bool = True


class ProviderPatch(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=100)
    type: str | None = Field(default=None, min_length=1, max_length=50)
    base_url: str | None = Field(default=None, min_length=1, max_length=500)
    api_key: str | None = None
    is_active: bool | None = None


class ModelPatch(BaseModel):
    is_enabled: bool


class GrantWrite(BaseModel):
    organization_ids: list[UUID]


def require_internal_secret(
    value: str | None = Header(default=None, alias="X-MailFlow-Internal-Secret"),
) -> None:
    expected = settings.INTERNAL_API_SECRET
    if not expected or not value or not secrets.compare_digest(value, expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="internal_only")


def _encrypted_key(value: str | None) -> str | None:
    return encrypt_secret({"api_key": value}) if value else None


async def _provider(provider_id: UUID, session: AsyncSession) -> LLMProvider:
    provider = (
        await session.execute(select(LLMProvider).where(LLMProvider.id == provider_id))
    ).scalar_one_or_none()
    if provider is None:
        raise HTTPException(status_code=404, detail="llm_provider_not_found")
    return provider


async def _sync_models(
    provider: LLMProvider, session: AsyncSession, *, discover: bool = True
) -> list[str]:
    models: list[str] = []
    if discover:
        api_key = None
        if provider.encrypted_api_key:
            from app.crypto import decrypt_secret

            api_key = str(decrypt_secret(provider.encrypted_api_key)["api_key"])
        payload = LLMModelDiscoveryRequest(
            type=provider.type, base_url=provider.base_url, api_key=api_key
        )
        models = await asyncio.to_thread(_discover_models, payload)
    if not models:
        models = [
            value
            for value in {
                provider.default_classification_model,
                provider.default_generation_model,
                provider.fast_classification_model,
                provider.deep_classification_model,
                provider.generation_model,
            }
            if value
        ]
    for model_id in models:
        await session.execute(
            text(
                "INSERT INTO llm_models (id, provider_id, model_id) "
                "VALUES (:id, :provider_id, :model_id) "
                "ON CONFLICT (provider_id, model_id) DO UPDATE SET updated_at = now()"
            ),
            {"id": uuid4(), "provider_id": provider.id, "model_id": model_id},
        )
    await session.commit()
    return sorted(models)


@router.get("")
async def instance_catalog(
    _auth: None = Depends(require_internal_secret),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    providers = list(
        (
            await session.execute(select(LLMProvider).order_by(LLMProvider.created_at))
        ).scalars()
    )
    model_rows = list(
        await session.execute(
            text(
                "SELECT m.id, m.provider_id, m.model_id, m.is_enabled, "
                "COALESCE(array_agg(a.org_id) FILTER (WHERE a.org_id IS NOT NULL), '{}') AS org_ids "
                "FROM llm_models m LEFT JOIN llm_org_model_access a ON a.model_id = m.id "
                "GROUP BY m.id, m.provider_id, m.model_id, m.is_enabled "
                "ORDER BY lower(m.model_id)"
            )
        )
    )
    organizations = list(
        await session.execute(
            text("SELECT id, name, slug FROM organizations ORDER BY lower(name), id")
        )
    )
    return {
        "providers": [
            {
                "id": str(p.id),
                "label": p.label,
                "type": p.type,
                "base_url": p.base_url,
                "has_api_key": p.encrypted_api_key is not None,
                "is_active": p.is_active,
            }
            for p in providers
        ],
        "models": [
            {
                "id": str(row.id),
                "provider_id": str(row.provider_id),
                "model_id": row.model_id,
                "is_enabled": row.is_enabled,
                "organization_ids": [str(value) for value in row.org_ids],
            }
            for row in model_rows
        ],
        "organizations": [
            {"id": str(row.id), "name": row.name, "slug": row.slug}
            for row in organizations
        ],
        "pricing": {"enabled": False, "implemented": False},
    }


@router.post("/providers", status_code=201)
async def create_instance_provider(
    payload: ProviderWrite,
    _auth: None = Depends(require_internal_secret),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    seed = (payload.seed_model or "unconfigured").strip()
    provider = LLMProvider(
        org_id=None,
        label=payload.label.strip(),
        type=payload.type.strip(),
        base_url=payload.base_url.strip(),
        encrypted_api_key=_encrypted_key(payload.api_key),
        default_classification_model=seed,
        default_generation_model=seed,
        is_active=payload.is_active,
    )
    session.add(provider)
    await session.commit()
    await session.refresh(provider)
    if payload.seed_model:
        await _sync_models(provider, session, discover=False)
    return {"id": str(provider.id)}


@router.patch("/providers/{provider_id}")
async def patch_instance_provider(
    provider_id: UUID,
    payload: ProviderPatch,
    _auth: None = Depends(require_internal_secret),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    provider = await _provider(provider_id, session)
    data = payload.model_dump(exclude_unset=True)
    if "api_key" in data:
        provider.encrypted_api_key = _encrypted_key(data.pop("api_key"))
    for key, value in data.items():
        if value is not None:
            setattr(provider, key, value.strip() if isinstance(value, str) else value)
    await session.commit()
    return {"id": str(provider.id)}


@router.delete("/providers/{provider_id}", status_code=204)
async def delete_instance_provider(
    provider_id: UUID,
    _auth: None = Depends(require_internal_secret),
    session: AsyncSession = Depends(get_session),
) -> None:
    provider = await _provider(provider_id, session)
    await session.delete(provider)
    await session.commit()


@router.post("/providers/{provider_id}/discover")
async def discover_instance_models(
    provider_id: UUID,
    _auth: None = Depends(require_internal_secret),
    session: AsyncSession = Depends(get_session),
) -> dict[str, list[str]]:
    provider = await _provider(provider_id, session)
    try:
        models = await _sync_models(provider, session)
    except HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"model_discovery_http_{exc.code}") from exc
    except (URLError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail="model_discovery_connection_failed") from exc
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=502, detail="model_discovery_invalid_response") from exc
    if not models:
        raise HTTPException(status_code=404, detail="no_models_discovered")
    return {"models": models}


@router.patch("/models/{model_pk}")
async def patch_catalog_model(
    model_pk: UUID,
    payload: ModelPatch,
    _auth: None = Depends(require_internal_secret),
    session: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    result = await session.execute(
        text("UPDATE llm_models SET is_enabled = :enabled, updated_at = now() WHERE id = :id RETURNING id"),
        {"enabled": payload.is_enabled, "id": model_pk},
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="llm_model_not_found")
    if not payload.is_enabled:
        await session.execute(
            text("DELETE FROM llm_org_model_access WHERE model_id = :id"), {"id": model_pk}
        )
    await session.commit()
    return {"is_enabled": payload.is_enabled}


@router.put("/models/{model_pk}/grants")
async def replace_model_grants(
    model_pk: UUID,
    payload: GrantWrite,
    _auth: None = Depends(require_internal_secret),
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    enabled = (
        await session.execute(
            text("SELECT is_enabled FROM llm_models WHERE id = :id"), {"id": model_pk}
        )
    ).scalar_one_or_none()
    if enabled is None:
        raise HTTPException(status_code=404, detail="llm_model_not_found")
    if not enabled and payload.organization_ids:
        raise HTTPException(status_code=422, detail="llm_model_disabled")
    await session.execute(
        text("DELETE FROM llm_org_model_access WHERE model_id = :id"), {"id": model_pk}
    )
    for org_id in set(payload.organization_ids):
        await session.execute(
            text(
                "INSERT INTO llm_org_model_access (org_id, model_id) VALUES (:org_id, :model_id)"
            ),
            {"org_id": org_id, "model_id": model_pk},
        )
    await session.commit()
    return {"count": len(set(payload.organization_ids))}
