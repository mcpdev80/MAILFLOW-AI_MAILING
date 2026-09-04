"""Server-to-server endpoints for trusted web/API integration.

The web server uses these routes for organization provisioning and Better Auth
membership lifecycle hooks. Trust comes from ``INTERNAL_API_SECRET`` and these
routes must also stay blocked from the public reverse proxy.
"""

from __future__ import annotations

import re
import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import generate_api_key
from app.config import settings
from app.database import get_session
from app.lifecycle import finalize_removed_member, private_mailboxes_owned_by
from app.models.organization import Organization

router = APIRouter(prefix="/internal", tags=["internal"])


async def require_internal_secret(
    x_internal_secret: str | None = Header(default=None, alias="X-Internal-Secret"),
) -> None:
    """Require the shared server secret for internal-only operations."""
    if not settings.INTERNAL_API_SECRET:
        raise HTTPException(status_code=501, detail="internal_api_disabled")
    if not x_internal_secret or not secrets.compare_digest(
        x_internal_secret, settings.INTERNAL_API_SECRET
    ):
        raise HTTPException(status_code=403, detail="forbidden")


class OrgCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=100)


class OrgCreated(BaseModel):
    org_id: str
    slug: str
    # The raw API key crosses this server-to-server boundary once. The web layer
    # encrypts it before persisting Better Auth organization metadata.
    api_key: str


class MemberLifecyclePayload(BaseModel):
    org_id: UUID
    user_id: str = Field(min_length=1, max_length=255)


class MemberRemovalCheck(BaseModel):
    ready: bool


def _slugify(value: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return s[:80] or "org"


@router.post(
    "/orgs",
    response_model=OrgCreated,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_internal_secret)],
)
async def create_org(
    payload: OrgCreate,
    session: AsyncSession = Depends(get_session),
) -> OrgCreated:
    """Create an organization and emit its API key, idempotent by generated slug."""
    base_slug = _slugify(payload.slug or payload.name)
    slug = base_slug
    for _ in range(5):
        exists = (
            await session.execute(
                select(Organization.id).where(Organization.slug == slug)
            )
        ).scalar_one_or_none()
        if exists is None:
            break
        slug = f"{base_slug}-{secrets.token_hex(3)}"

    raw_key, key_hash = generate_api_key()
    org = Organization(name=payload.name, slug=slug, api_key_hash=key_hash)
    session.add(org)
    await session.commit()
    await session.refresh(org)
    return OrgCreated(org_id=str(org.id), slug=org.slug, api_key=raw_key)


@router.post(
    "/lifecycle/member-removal-check",
    response_model=MemberRemovalCheck,
    dependencies=[Depends(require_internal_secret)],
)
async def member_removal_check(
    payload: MemberLifecyclePayload,
    session: AsyncSession = Depends(get_session),
) -> MemberRemovalCheck:
    """Block Better Auth member removal until private ownership is resolved."""
    owned = await private_mailboxes_owned_by(
        session,
        org_id=payload.org_id,
        user_id=payload.user_id,
    )
    if owned:
        raise HTTPException(status_code=409, detail="private_mailboxes_require_resolution")
    return MemberRemovalCheck(ready=True)


@router.post(
    "/lifecycle/member-removed",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_internal_secret)],
)
async def member_removed(
    payload: MemberLifecyclePayload,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Finalize resource access cleanup after Better Auth removed membership."""
    try:
        await finalize_removed_member(
            session,
            org_id=payload.org_id,
            user_id=payload.user_id,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    await session.commit()
