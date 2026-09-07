"""Organization-scoped selection from the instance-managed LLM catalog."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_org, require_org_admin
from app.database import get_session
from app.models.organization import Organization

router = APIRouter(prefix="/llm-catalog", tags=["llm-catalog"])


class RoleChoice(BaseModel):
    model_id: UUID


class RoleChoices(BaseModel):
    fast: RoleChoice | None = None
    deep: RoleChoice | None = None
    generation: RoleChoice | None = None


@router.get("/models")
async def available_models(
    org: Organization = Depends(require_org),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    rows = list(
        await session.execute(
            text(
                "SELECT m.id, m.model_id, p.id AS provider_id, p.label AS provider_label, p.type AS provider_type "
                "FROM llm_org_model_access a "
                "JOIN llm_models m ON m.id = a.model_id "
                "JOIN llm_providers p ON p.id = m.provider_id "
                "WHERE a.org_id = :org_id AND m.is_enabled = true AND p.is_active = true "
                "ORDER BY lower(p.label), lower(m.model_id)"
            ),
            {"org_id": org.id},
        )
    )
    return {
        "models": [
            {
                "id": str(row.id),
                "model_id": row.model_id,
                "provider_id": str(row.provider_id),
                "provider_label": row.provider_label,
                "provider_type": row.provider_type,
            }
            for row in rows
        ],
        # Reserved for a future optional price-display feature. Keeping the
        # response shape explicit prevents pricing from becoming an authorization concern.
        "pricing": {"enabled": False, "implemented": False},
    }


@router.get("/assignments")
async def get_assignments(
    org: Organization = Depends(require_org),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    rows = list(
        await session.execute(
            text(
                "SELECT a.role, m.id AS catalog_model_id, a.provider_id, a.model_id "
                "FROM llm_role_assignments a "
                "LEFT JOIN llm_models m ON m.provider_id = a.provider_id AND m.model_id = a.model_id "
                "WHERE a.org_id = :org_id"
            ),
            {"org_id": org.id},
        )
    )
    values = {
        row.role: {
            "catalog_model_id": str(row.catalog_model_id) if row.catalog_model_id else None,
            "provider_id": str(row.provider_id),
            "model_id": row.model_id,
        }
        for row in rows
    }
    return {
        "fast": values.get("fast"),
        "deep": values.get("deep"),
        "generation": values.get("generation"),
    }


@router.put("/assignments")
async def put_assignments(
    payload: RoleChoices,
    org: Organization = Depends(require_org_admin),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    for role in ("fast", "deep", "generation"):
        choice = getattr(payload, role)
        if choice is None:
            continue
        row = (
            await session.execute(
                text(
                    "SELECT m.provider_id, m.model_id "
                    "FROM llm_org_model_access access "
                    "JOIN llm_models m ON m.id = access.model_id "
                    "JOIN llm_providers p ON p.id = m.provider_id "
                    "WHERE access.org_id = :org_id AND m.id = :model_id "
                    "AND m.is_enabled = true AND p.is_active = true"
                ),
                {"org_id": org.id, "model_id": choice.model_id},
            )
        ).first()
        if row is None:
            raise HTTPException(status_code=422, detail="llm_model_not_available")
        await session.execute(
            text(
                "INSERT INTO llm_role_assignments (org_id, role, provider_id, model_id) "
                "VALUES (:org_id, :role, :provider_id, :model_id) "
                "ON CONFLICT (org_id, role) DO UPDATE SET "
                "provider_id = EXCLUDED.provider_id, model_id = EXCLUDED.model_id, updated_at = now()"
            ),
            {
                "org_id": org.id,
                "role": role,
                "provider_id": row.provider_id,
                "model_id": row.model_id,
            },
        )
    await session.commit()
    return await get_assignments(org, session)
