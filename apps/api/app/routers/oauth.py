"""OAuth2 routes for connecting Gmail and Microsoft 365 mailboxes.

The OAuth callback is provider-initiated and therefore does not carry the BFF
actor headers. The signed ``state`` token binds the flow to the MailFlow tenant,
the initiating Better Auth organization/user and the chosen ownership settings.
Membership is checked again on callback so a stale consent flow cannot grant
mailbox access after a user was removed or an admin role was revoked.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app import oauth
from app.auth import RequestIdentity, require_identity
from app.config import settings
from app.crypto import encrypt
from app.database import get_session
from app.mailbox_access import (
    OWNERSHIP_PRIVATE,
    OWNERSHIP_SHARED,
    SHARED_ADMIN_ROLES,
    ensure_org_members,
    new_account_ownership,
)
from app.models.email_account import EmailAccount
from app.models.mailbox_access import MailboxAccess

logger = logging.getLogger("mailflow.api")

router = APIRouter(prefix="/oauth", tags=["oauth"])

STATE_TTL_SECONDS = 600
_SIG_LEN = 32


def _sign_state(
    org_id: str,
    *,
    auth_org_id: str | None,
    owner_user_id: str | None,
    manager_user_id: str | None,
    ownership_mode: str,
    shared_user_ids: list[str],
) -> str:
    """Sign ownership and sharing choices into short-lived OAuth state."""
    payload = json.dumps(
        {
            "org": org_id,
            "auth_org": auth_org_id,
            "owner": owner_user_id,
            "manager": manager_user_id,
            "mode": ownership_mode,
            "shared_users": sorted(set(shared_user_ids)),
            "nonce": secrets.token_urlsafe(8),
            "ts": int(time.time()),
        },
        separators=(",", ":"),
    ).encode()
    sig = hmac.new(settings.SECRET_KEY.encode(), payload, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(payload + sig).decode()


def _verify_state(state: str) -> dict[str, object]:
    """Validate OAuth state and return its signed payload."""
    try:
        raw = base64.urlsafe_b64decode(state.encode())
        payload, sig = raw[:-_SIG_LEN], raw[-_SIG_LEN:]
        if not payload:
            raise ValueError("empty payload")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="invalid_state") from exc

    expected = hmac.new(settings.SECRET_KEY.encode(), payload, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=400, detail="invalid_state")

    data = json.loads(payload)
    if int(time.time()) - int(data.get("ts", 0)) > STATE_TTL_SECONDS:
        raise HTTPException(status_code=400, detail="state_expired")
    if data.get("mode") not in {OWNERSHIP_PRIVATE, OWNERSHIP_SHARED}:
        raise HTTPException(status_code=400, detail="invalid_state")
    return data


async def _member_roles(
    session: AsyncSession,
    auth_org_id: str,
    user_ids: set[str],
) -> dict[str, str]:
    """Return current Better Auth roles for selected users in one organization."""
    if not user_ids:
        return {}
    rows = await session.execute(
        text(
            'SELECT "userId", role FROM "member" '
            'WHERE "organizationId" = :organization_id'
        ),
        {"organization_id": auth_org_id},
    )
    return {
        str(user_id): str(role)
        for user_id, role in rows
        if str(user_id) in user_ids
    }


@router.get("/{provider}/authorize")
async def authorize(
    provider: str,
    ownership_mode: Literal["private", "shared"] | None = Query(default=None),
    shared_user_ids: list[str] | None = Query(default=None),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Return a provider consent URL bound to ownership and sharing settings."""
    if not oauth.is_supported(provider):
        raise HTTPException(status_code=404, detail="unsupported_provider")

    selected_users = shared_user_ids or []
    mode, owner_user_id = new_account_ownership(identity, ownership_mode)
    if mode != OWNERSHIP_SHARED and selected_users:
        raise HTTPException(
            status_code=422,
            detail="shared_users_require_shared_mailbox",
        )
    if mode == OWNERSHIP_SHARED:
        await ensure_org_members(session, identity, selected_users)
        if identity.user_id:
            await ensure_org_members(session, identity, [identity.user_id])

    try:
        url = oauth.authorize_url(
            provider,
            _sign_state(
                str(identity.org.id),
                auth_org_id=identity.auth_org_id,
                owner_user_id=owner_user_id,
                manager_user_id=(
                    identity.user_id if mode == OWNERSHIP_SHARED else None
                ),
                ownership_mode=mode,
                shared_user_ids=(
                    selected_users if mode == OWNERSHIP_SHARED else []
                ),
            ),
        )
    except oauth.OAuthNotConfigured as exc:
        raise HTTPException(
            status_code=400,
            detail=f"oauth_not_configured: {exc}",
        ) from exc
    return {"authorize_url": url}


@router.get("/{provider}/callback")
async def callback(
    provider: str,
    code: str = Query(default=""),
    state: str = Query(default=""),
    error: str = Query(default=""),
    session: AsyncSession = Depends(get_session),
) -> RedirectResponse:
    """Exchange the provider code and connect the mailbox from signed state."""
    success = settings.OAUTH_SUCCESS_REDIRECT
    if error:
        return RedirectResponse(f"{success}?error={error}", status_code=302)
    if not code or not state or not oauth.is_supported(provider):
        return RedirectResponse(
            f"{success}?error=invalid_request",
            status_code=302,
        )

    data = _verify_state(state)
    org_id = UUID(str(data["org"]))
    auth_org_id = data.get("auth_org")
    ownership_mode = str(data["mode"])
    owner_user_id = data.get("owner")
    manager_user_id = data.get("manager")
    shared_user_ids = [str(value) for value in data.get("shared_users", [])]

    # In authenticated mode, confirm that the signed users still belong to the
    # active Better Auth organization at callback time. For new shared mailboxes
    # the manager must also still hold an owner/admin organization role.
    if auth_org_id:
        relevant_users = set(shared_user_ids)
        if owner_user_id:
            relevant_users.add(str(owner_user_id))
        if manager_user_id:
            relevant_users.add(str(manager_user_id))
        roles = await _member_roles(session, str(auth_org_id), relevant_users)
        if set(roles) != relevant_users:
            return RedirectResponse(
                f"{success}?error=organization_membership_changed",
                status_code=302,
            )
        if ownership_mode == OWNERSHIP_SHARED and manager_user_id:
            if roles.get(str(manager_user_id)) not in SHARED_ADMIN_ROLES:
                return RedirectResponse(
                    f"{success}?error=shared_mailbox_admin_required",
                    status_code=302,
                )

    try:
        result = await asyncio.to_thread(oauth.exchange_code, provider, code)
    except oauth.OAuthError as exc:
        logger.warning("oauth exchange failed (%s): %s", provider, exc)
        return RedirectResponse(f"{success}?error=oauth_failed", status_code=302)

    host, port = oauth.imap_endpoint(provider)

    base_match = [
        EmailAccount.org_id == org_id,
        EmailAccount.username == result.email,
        EmailAccount.provider_type == provider,
        EmailAccount.ownership_mode == ownership_mode,
    ]
    if ownership_mode == OWNERSHIP_PRIVATE:
        base_match.append(EmailAccount.owner_user_id == owner_user_id)

    existing = (
        await session.execute(select(EmailAccount).where(*base_match))
    ).scalars().first()

    if existing and ownership_mode == OWNERSHIP_SHARED and manager_user_id:
        can_manage = (
            await session.execute(
                select(MailboxAccess.id).where(
                    MailboxAccess.account_id == existing.id,
                    MailboxAccess.user_id == str(manager_user_id),
                    MailboxAccess.can_manage.is_(True),
                )
            )
        ).scalar_one_or_none()
        if can_manage is None:
            return RedirectResponse(
                f"{success}?error=mailbox_access_denied",
                status_code=302,
            )

    enc = encrypt({"refresh_token": result.refresh_token}, settings.SECRET_KEY)
    if existing:
        existing.encrypted_oauth = enc
        existing.is_active = True
        account = existing
    else:
        account = EmailAccount(
            org_id=org_id,
            owner_user_id=str(owner_user_id) if owner_user_id else None,
            ownership_mode=ownership_mode,
            provider_type=provider,
            imap_host=host,
            imap_port=port,
            use_ssl=True,
            username=result.email,
            encrypted_oauth=enc,
        )
        session.add(account)
        await session.flush()

    if ownership_mode == OWNERSHIP_SHARED and not existing:
        use_users = set(shared_user_ids)
        desired_users = set(use_users)
        if manager_user_id:
            desired_users.add(str(manager_user_id))
        for user_id in desired_users:
            session.add(
                MailboxAccess(
                    account_id=account.id,
                    user_id=user_id,
                    can_use=user_id in use_users,
                    can_manage=user_id == manager_user_id,
                )
            )

    await session.commit()
    return RedirectResponse(
        f"{success}?connected={provider}",
        status_code=status.HTTP_302_FOUND,
    )
