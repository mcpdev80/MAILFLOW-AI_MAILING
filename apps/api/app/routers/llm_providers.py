"""Organization-scoped LLM provider CRUD endpoints."""

from __future__ import annotations

import asyncio
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_org, require_org_admin
from app.crypto import decrypt_secret, encrypt_secret
from app.database import get_session
from app.llm_schemas import (
    LLMModelDiscoveryOut,
    LLMModelDiscoveryRequest,
    LLMRoleAssignment,
    LLMRoleAssignmentsOut,
    LLMRoleAssignmentsUpdate,
    LLMProviderCreate,
    LLMProviderOut,
    LLMProviderUpdate,
)
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


def _openai_models_url(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/models"


def _ollama_models_url(base_url: str) -> str:
    normalized = base_url.rstrip("/")
    if normalized.endswith("/v1"):
        normalized = normalized[:-3]
    return f"{normalized}/api/tags"


def _fetch_model_ids(url: str, api_key: str | None, *, provider_type: str) -> list[str]:
    headers = {"Accept": "application/json"}
    if api_key:
        if provider_type == "anthropic":
            headers["x-api-key"] = api_key
            headers["anthropic-version"] = "2023-06-01"
        elif provider_type != "gemini":
            headers["Authorization"] = f"Bearer {api_key}"

    request = Request(url, headers=headers, method="GET")
    with urlopen(request, timeout=8) as response:  # noqa: S310 - admin-configured endpoint
        payload = json.loads(response.read().decode("utf-8"))

    if provider_type == "ollama":
        raw_models = payload.get("models", []) if isinstance(payload, dict) else []
        values = [item.get("name") for item in raw_models if isinstance(item, dict)]
    elif provider_type == "gemini":
        raw_models = payload.get("models", []) if isinstance(payload, dict) else []
        values = [
            str(item.get("name", "")).removeprefix("models/")
            for item in raw_models
            if isinstance(item, dict)
        ]
    else:
        raw_models = payload.get("data", []) if isinstance(payload, dict) else []
        values = [item.get("id") for item in raw_models if isinstance(item, dict)]

    return sorted(
        {value for value in values if isinstance(value, str) and value.strip()}
    )


def _discover_models(payload: LLMModelDiscoveryRequest) -> list[str]:
    base_url = payload.base_url.strip().rstrip("/")
    if not base_url.startswith(("http://", "https://")):
        raise ValueError("provider_url_must_use_http_or_https")

    provider_type = payload.type.strip().lower()
    if provider_type == "ollama":
        return _fetch_model_ids(
            _ollama_models_url(base_url), payload.api_key, provider_type=provider_type
        )
    if provider_type == "gemini":
        url = f"{base_url}/models"
        if payload.api_key:
            url = f"{url}?key={payload.api_key}"
        return _fetch_model_ids(url, payload.api_key, provider_type=provider_type)
    return _fetch_model_ids(
        _openai_models_url(base_url), payload.api_key, provider_type=provider_type
    )


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


@router.post("/discover-models", response_model=LLMModelDiscoveryOut)
async def discover_models(
    payload: LLMModelDiscoveryRequest,
    _org: Organization = Depends(require_org_admin),
) -> LLMModelDiscoveryOut:
    try:
        models = await asyncio.to_thread(_discover_models, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"model_discovery_http_{exc.code}",
        ) from exc
    except (URLError, TimeoutError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="model_discovery_connection_failed",
        ) from exc
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="model_discovery_invalid_response",
        ) from exc

    if not models:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="no_models_discovered"
        )
    return LLMModelDiscoveryOut(models=models)


@router.get("/role-assignments", response_model=LLMRoleAssignmentsOut)
async def get_role_assignments(
    org: Organization = Depends(require_org),
    session: AsyncSession = Depends(get_session),
) -> LLMRoleAssignmentsOut:
    rows = await session.execute(
        text(
            "SELECT role, provider_id, model_id FROM llm_role_assignments "
            "WHERE org_id = :org_id"
        ),
        {"org_id": org.id},
    )
    values = {
        row.role: LLMRoleAssignment(
            role=row.role, provider_id=row.provider_id, model_id=row.model_id
        )
        for row in rows
    }
    return LLMRoleAssignmentsOut(
        fast=values.get("fast"),
        deep=values.get("deep"),
        generation=values.get("generation"),
    )


@router.put("/role-assignments", response_model=LLMRoleAssignmentsOut)
async def put_role_assignments(
    payload: LLMRoleAssignmentsUpdate,
    org: Organization = Depends(require_org_admin),
    session: AsyncSession = Depends(get_session),
) -> LLMRoleAssignmentsOut:
    assignments = [
        item
        for item in (payload.fast, payload.deep, payload.generation)
        if item is not None
    ]
    for item in assignments:
        if item.role not in {"fast", "deep", "generation"}:
            raise HTTPException(status_code=422, detail="invalid_llm_role")
        provider = await _get_owned(item.provider_id, org, session)
        if not provider.is_active:
            raise HTTPException(status_code=422, detail="llm_provider_inactive")
        await session.execute(
            text(
                "INSERT INTO llm_role_assignments (org_id, role, provider_id, model_id) "
                "VALUES (:org_id, :role, :provider_id, :model_id) "
                "ON CONFLICT (org_id, role) DO UPDATE SET "
                "provider_id = EXCLUDED.provider_id, model_id = EXCLUDED.model_id, updated_at = now()"
            ),
            {
                "org_id": org.id,
                "role": item.role,
                "provider_id": item.provider_id,
                "model_id": item.model_id,
            },
        )
    await session.commit()
    return await get_role_assignments(org, session)


@router.get("/{provider_id}/models", response_model=LLMModelDiscoveryOut)
async def discover_saved_provider_models(
    provider_id: UUID,
    org: Organization = Depends(require_org_admin),
    session: AsyncSession = Depends(get_session),
) -> LLMModelDiscoveryOut:
    provider = await _get_owned(provider_id, org, session)
    api_key = None
    if provider.encrypted_api_key:
        api_key = str(decrypt_secret(provider.encrypted_api_key)["api_key"])
    request_payload = LLMModelDiscoveryRequest(
        type=provider.type, base_url=provider.base_url, api_key=api_key
    )
    try:
        models = await asyncio.to_thread(_discover_models, request_payload)
    except (
        HTTPError,
        URLError,
        TimeoutError,
        json.JSONDecodeError,
        UnicodeDecodeError,
    ) as exc:
        raise HTTPException(
            status_code=502, detail="model_discovery_connection_failed"
        ) from exc
    if not models:
        raise HTTPException(status_code=404, detail="no_models_discovered")
    return LLMModelDiscoveryOut(models=models)


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
