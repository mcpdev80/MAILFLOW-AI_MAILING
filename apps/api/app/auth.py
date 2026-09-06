"""Authentication and request identity resolution.

Two API authentication modes are supported:

- ``single``: self-hosted mode with one default organization. An optional
  ``SINGLE_TENANT_API_KEY`` can protect the API.
- ``multi``: every request carries an organization API key. Mailbox-scoped
  endpoints additionally require a signed user identity from the web BFF.

The organization API key identifies the tenant, not the human user. Private
mailbox authorization therefore never relies on the organization key alone.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_session
from app.models.organization import Organization

DEFAULT_ORG_SLUG = "default"
API_KEY_PREFIX = "mf_"
ACTOR_HEADER_TTL_SECONDS = 60
RECENT_AUTH_MAX_AGE_SECONDS = 10 * 60


@dataclass(frozen=True)
class RequestIdentity:
    """Authenticated tenant plus optional human actor.

    ``auth_time`` is the Better Auth session creation timestamp signed by the web
    BFF. It is used only for explicit step-up checks on sensitive operations and
    never broadens the actor's normal authorization.
    """

    org: Organization
    user_id: str | None
    auth_org_id: str | None = None
    role: str | None = None
    auth_time: int | None = None


def hash_api_key(raw_key: str) -> str:
    """Return the deterministic SHA-256 hash used to look up an API key."""
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_api_key() -> tuple[str, str]:
    """Generate ``(raw_key, hash)``. The raw key is shown only once."""
    raw = API_KEY_PREFIX + secrets.token_urlsafe(32)
    return raw, hash_api_key(raw)


def _extract_key(
    x_api_key: str | None,
    authorization: str | None,
) -> str | None:
    """Read the organization API key from supported request headers."""
    if x_api_key:
        return x_api_key.strip()
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def actor_signature_payload(
    method: str,
    path: str,
    user_id: str,
    org_id: UUID | str,
    auth_org_id: str,
    role: str,
    timestamp: int | str,
    auth_time: int | str | None = None,
) -> bytes:
    """Build the canonical payload signed by the trusted web BFF.

    ``auth_time`` is optional only for rolling compatibility with pre-passkey BFF
    requests. Sensitive endpoints reject identities that do not carry it.
    """
    fields = [method.upper(), path, user_id, str(org_id), auth_org_id, role]
    if auth_time is not None:
        fields.append(str(auth_time))
    fields.append(str(timestamp))
    return "\n".join(fields).encode("utf-8")


def sign_actor_identity(
    secret: str,
    *,
    method: str,
    path: str,
    user_id: str,
    org_id: UUID | str,
    auth_org_id: str,
    role: str,
    timestamp: int,
    auth_time: int | None = None,
) -> str:
    """Return the HMAC signature used for BFF-to-API actor propagation."""
    return hmac.new(
        secret.encode("utf-8"),
        actor_signature_payload(
            method,
            path,
            user_id,
            org_id,
            auth_org_id,
            role,
            timestamp,
            auth_time,
        ),
        hashlib.sha256,
    ).hexdigest()


def require_recent_auth(identity: RequestIdentity) -> None:
    """Require a recently created human-authenticated session in multi-user mode."""
    if identity.user_id is None:
        return
    if identity.auth_time is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="recent_auth_required",
        )
    age = int(time.time()) - identity.auth_time
    if age < 0 or age > RECENT_AUTH_MAX_AGE_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="recent_auth_required",
        )


async def _get_or_create_default_org(session: AsyncSession) -> Organization:
    """Return the self-host default organization, creating it if necessary."""
    org = (
        await session.execute(
            select(Organization).where(Organization.slug == DEFAULT_ORG_SLUG)
        )
    ).scalar_one_or_none()
    if org is None:
        org = Organization(name="Default", slug=DEFAULT_ORG_SLUG, plan="free")
        session.add(org)
        await session.commit()
        await session.refresh(org)
    return org


async def require_org(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> Organization:
    """Resolve the organization (tenant) for the current request."""
    provided = _extract_key(x_api_key, authorization)

    if settings.AUTH_MODE == "multi":
        if not provided:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="api_key_required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        org = (
            await session.execute(
                select(Organization).where(
                    Organization.api_key_hash == hash_api_key(provided)
                )
            )
        ).scalar_one_or_none()
        if org is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid_api_key",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return org

    expected = settings.SINGLE_TENANT_API_KEY
    if expected and not secrets.compare_digest(provided or "", expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_api_key",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await _get_or_create_default_org(session)


async def require_identity(
    request: Request,
    org: Organization = Depends(require_org),
    actor_user_id: str | None = Header(default=None, alias="X-MailFlow-Actor-User-Id"),
    actor_org_id: str | None = Header(default=None, alias="X-MailFlow-Actor-Org-Id"),
    actor_auth_org_id: str | None = Header(
        default=None, alias="X-MailFlow-Actor-Auth-Org-Id"
    ),
    actor_role: str | None = Header(default=None, alias="X-MailFlow-Actor-Role"),
    actor_auth_time: str | None = Header(
        default=None, alias="X-MailFlow-Actor-Auth-Time"
    ),
    actor_timestamp: str | None = Header(
        default=None, alias="X-MailFlow-Actor-Timestamp"
    ),
    actor_signature: str | None = Header(
        default=None, alias="X-MailFlow-Actor-Signature"
    ),
) -> RequestIdentity:
    """Resolve a trusted human actor for mailbox-scoped authorization.

    The signed authentication time allows sensitive endpoints to require recent
    authentication without trusting a browser-provided timestamp.
    """
    if settings.AUTH_MODE != "multi":
        return RequestIdentity(org=org, user_id=None)

    if not settings.INTERNAL_API_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="actor_auth_not_configured",
        )

    if not all(
        [
            actor_user_id,
            actor_org_id,
            actor_auth_org_id,
            actor_role,
            actor_timestamp,
            actor_signature,
        ]
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="actor_identity_required",
        )

    try:
        auth_time = int(actor_auth_time) if actor_auth_time is not None else None
        timestamp = int(actor_timestamp)
        signed_org_id = UUID(actor_org_id)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_actor_identity",
        ) from exc

    if signed_org_id != org.id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_actor_identity",
        )

    now = int(time.time())
    if abs(now - timestamp) > ACTOR_HEADER_TTL_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="actor_identity_expired",
        )

    expected = sign_actor_identity(
        settings.INTERNAL_API_SECRET,
        method=request.method,
        path=request.url.path,
        user_id=actor_user_id,
        org_id=org.id,
        auth_org_id=actor_auth_org_id,
        role=actor_role,
        timestamp=timestamp,
        auth_time=auth_time,
    )
    if not hmac.compare_digest(actor_signature, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_actor_identity",
        )

    return RequestIdentity(
        org=org,
        user_id=actor_user_id,
        auth_org_id=actor_auth_org_id,
        role=actor_role,
        auth_time=auth_time,
    )


async def require_org_admin(
    identity: RequestIdentity = Depends(require_identity),
) -> Organization:
    """Allow privileged organization operations only to owners/admins in SaaS mode."""
    if identity.user_id is not None and identity.role not in {"owner", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="organization_admin_required",
        )
    return identity.org
