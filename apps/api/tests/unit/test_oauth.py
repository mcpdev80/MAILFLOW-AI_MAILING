"""OAuth helper and signed-state tests without network access."""

from __future__ import annotations

import os

import pytest

os.environ.setdefault("SECRET_KEY", "qdCa5nGhLjd8qY0CCaQP2dE000lbSYDmtPnhzAVeVgs=")


def _private_state(org_id: str = "org-123") -> str:
    from app.routers.oauth import _sign_state

    return _sign_state(
        org_id,
        auth_org_id="better-auth-org-123",
        owner_user_id="user-123",
        manager_user_id=None,
        ownership_mode="private",
        shared_user_ids=[],
    )


def test_state_sign_verify_roundtrip():
    from app.routers.oauth import _verify_state

    data = _verify_state(_private_state())
    assert data["org"] == "org-123"
    assert data["auth_org"] == "better-auth-org-123"
    assert data["owner"] == "user-123"
    assert data["mode"] == "private"
    assert data["shared_users"] == []


def test_shared_state_preserves_selected_users():
    from app.routers.oauth import _sign_state, _verify_state

    state = _sign_state(
        "org-shared",
        auth_org_id="better-auth-org-shared",
        owner_user_id=None,
        manager_user_id="admin-1",
        ownership_mode="shared",
        shared_user_ids=["user-b", "user-a", "user-b"],
    )
    data = _verify_state(state)
    assert data["org"] == "org-shared"
    assert data["auth_org"] == "better-auth-org-shared"
    assert data["owner"] is None
    assert data["manager"] == "admin-1"
    assert data["mode"] == "shared"
    assert data["shared_users"] == ["user-a", "user-b"]


def test_state_expires(monkeypatch):
    import types

    from fastapi import HTTPException

    from app.routers import oauth as oauth_router

    state = _private_state()
    future = oauth_router.time.time() + oauth_router.STATE_TTL_SECONDS + 1
    monkeypatch.setattr(
        oauth_router, "time", types.SimpleNamespace(time=lambda: future)
    )
    with pytest.raises(HTTPException) as exc:
        oauth_router._verify_state(state)
    assert exc.value.detail == "state_expired"


def test_state_roundtrip_is_stable_across_many_signatures():
    from app.routers.oauth import _verify_state

    for _ in range(300):
        assert _verify_state(_private_state("org-xyz"))["org"] == "org-xyz"


def test_state_is_unique_per_call():
    assert _private_state("org-1") != _private_state("org-1")


def test_state_tamper_is_rejected():
    from fastapi import HTTPException

    from app.routers.oauth import _verify_state

    state = _private_state()
    tampered = state[:-2] + ("AA" if not state.endswith("AA") else "BB")
    with pytest.raises(HTTPException):
        _verify_state(tampered)


def test_garbage_state_is_rejected():
    from fastapi import HTTPException

    from app.routers.oauth import _verify_state

    with pytest.raises(HTTPException):
        _verify_state("not-a-valid-state")


def test_supported_providers_and_endpoints():
    from app import oauth

    assert oauth.is_supported("gmail")
    assert oauth.is_supported("microsoft")
    assert not oauth.is_supported("imap")
    assert oauth.imap_endpoint("gmail") == ("imap.gmail.com", 993)
    assert oauth.imap_endpoint("microsoft") == ("outlook.office365.com", 993)


def test_authorize_url_not_configured_raises():
    from app import oauth
    from app.config import settings

    orig = (settings.GOOGLE_CLIENT_ID, settings.GOOGLE_CLIENT_SECRET)
    settings.GOOGLE_CLIENT_ID = ""
    settings.GOOGLE_CLIENT_SECRET = ""
    try:
        with pytest.raises(oauth.OAuthNotConfigured):
            oauth.authorize_url("gmail", "state123")
    finally:
        settings.GOOGLE_CLIENT_ID, settings.GOOGLE_CLIENT_SECRET = orig


def test_google_authorize_url_includes_params(monkeypatch):
    from app import oauth
    from app.config import settings

    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "gid")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "gsecret")
    monkeypatch.setattr(settings, "OAUTH_REDIRECT_BASE", "https://api.example.com")

    url = oauth.authorize_url("gmail", "state-xyz")
    assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert "client_id=gid" in url
    assert "state=state-xyz" in url
    assert "access_type=offline" in url
    assert "mail.google.com" in url
    assert "oauth%2Fgmail%2Fcallback" in url


def test_email_from_id_token_decodes_claims():
    import base64
    import json

    from app.oauth import _google_email_from_id_token

    payload = (
        base64.urlsafe_b64encode(json.dumps({"email": "me@gmail.com"}).encode())
        .decode()
        .rstrip("=")
    )
    id_token = f"header.{payload}.sig"
    assert _google_email_from_id_token(id_token) == "me@gmail.com"
    assert _google_email_from_id_token("garbage") == ""
