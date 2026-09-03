"""OAuth2 routes for connecting Gmail and Microsoft 365 mailboxes.

The OAuth callback is provider-initiated and therefore does not carry the BFF
actor headers. The signed ``state`` token binds the flow to both the MailFlow
organization and the Better Auth user that started it. This prevents one member
from reconnecting or taking over another member's private mailbox.
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
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import oauth
from app.auth import RequestIdentity, require_identity
from app.config import settings
from app.crypto import encrypt
from app.database import get_session
from app.mailbox_access import OWNERSHIP_PRIVATE, OWNERSHIP_SHARED
from app.models.email_account import EmailAccount

logger = logging.getLogger("mailflow.api")

router = APIRouter(prefix="/oauth", tags=["oauth"])

STATE_TTL_SECONDS = 600
_SIG_LEN = 32


def _sign_state(org_id: str, user_id: str | None) -> str:
    """Sign organization and mailbox owner into a short-lived OAuth state."""
    payload = json.dumps(
        {
            "org": org_id,
            "user": user_id,
            "nonce": secrets.token_urlsafe(8),
            "ts": int(time.time()),
        }
    ).encode()
    sig = hmac.new(settings.SECRET_KEY.encode(), payload, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(payload + sig).decode()


def _verify_state(state: str) -> tuple[str, str | None]:
    """Validate OAuth state and return ``(org_id, owner_user_id)``."""
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
    return data["org"], data.get("user")


@router.get("/{provider}/authorize")
async def authorize(
    provider: str,
    identity: RequestIdentity = Depends(require_identity),
) -> dict[str, str]:
    """Return a provider consent URL bound to the current mailbox owner."""
    if not oauth.is_supported(provider):
        raise HTTPException(status_code=404, detail="unsupported_provider")
    try:
        url = oauth.authorize_url(
            provider,
            _sign_state(str(identity.org.id), identity.user_id),
        )
    except oauth.OAuthNotConfigured as exc:
        raise HTTPException(
            status_code=400, detail=f"oauth_not_configured: {exc}"
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
        return RedirectResponse(f"{success}?error=invalid_request", status_code=302)

    raw_org_id, owner_user_id = _verify_state(state)
    org_id = UUID(raw_org_id)
    ownership_mode = OWNERSHIP_PRIVATE if owner_user_id else OWNERSHIP_SHARED

    try:
        result = await asyncio.to_thread(oauth.exchange_code, provider, code)
    except oauth.OAuthError as exc:
        logger.warning("oauth exchange failed (%s): %s", provider, exc)
        return RedirectResponse(f"{success}?error=oauth_failed", status_code=302)

    host, port = oauth.imap_endpoint(provider)

    # Ownership is part of the identity. The same address may legitimately be
    # connected by different users, and reconnecting must never overwrite a
    # different owner's refresh token.
    existing = (
        await session.execute(
            select(EmailAccount).where(
                EmailAccount.org_id == org_id,
                EmailAccount.username == result.email,
                EmailAccount.provider_type == provider,
                EmailAccount.ownership_mode == ownership_mode,
                EmailAccount.owner_user_id == owner_user_id,
            )
        )
    ).scalar_one_or_none()

    enc = encrypt({"refresh_token": result.refresh_token}, settings.SECRET_KEY)
    if existing:
        existing.encrypted_oauth = enc
        existing.is_active = True
    else:
        session.add(
            EmailAccount(
                org_id=org_id,
                owner_user_id=owner_user_id,
                ownership_mode=ownership_mode,
                provider_type=provider,
                imap_host=host,
                imap_port=port,
                use_ssl=True,
                username=result.email,
                encrypted_oauth=enc,
            )
        )
    await session.commit()
    return RedirectResponse(
        f"{success}?connected={provider}", status_code=status.HTTP_302_FOUND
    )
