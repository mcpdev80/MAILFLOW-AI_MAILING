"""Tests for validating and rotating encrypted database secrets."""

from uuid import uuid4

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select

from app.config import settings
from app.models.email_account import EmailAccount
from app.models.llm_provider import LLMProvider
from app.models.organization import Organization
from app.secret_storage import rotate_stored_secrets, validate_stored_secrets
from app.secrets import SecretConfigurationError, SecretManager


@pytest.mark.asyncio
async def test_rotate_all_secret_types_to_primary_key(session, monkeypatch):
    old_key = Fernet.generate_key().decode()
    new_key = Fernet.generate_key().decode()
    old = SecretManager([old_key])

    suffix = uuid4().hex[:8]
    org = Organization(name="Secret rotation", slug=f"secret-rotation-{suffix}", plan="free")
    session.add(org)
    await session.flush()

    provider = LLMProvider(
        org_id=org.id,
        label="local",
        type="custom",
        base_url="http://localhost:4000/v1",
        encrypted_api_key=old.encrypt({"api_key": "provider-secret"}),
        default_classification_model="fast",
        default_generation_model="deep",
    )
    session.add(provider)
    await session.flush()

    account = EmailAccount(
        org_id=org.id,
        owner_user_id=None,
        ownership_mode="shared",
        provider_type="gmail",
        imap_host="imap.gmail.com",
        username=f"secret-{suffix}@example.com",
        encrypted_credentials=old.encrypt({"password": "imap-secret"}),
        encrypted_oauth=old.encrypt({"refresh_token": "oauth-secret"}),
        llm_provider_id=provider.id,
    )
    session.add(account)
    await session.commit()

    monkeypatch.setattr(settings, "SECRET_ENCRYPTION_KEYS", f"{new_key},{old_key}")
    monkeypatch.setattr(settings, "SECRET_KEY", old_key)

    assert await validate_stored_secrets(session) >= 3
    result = await rotate_stored_secrets(session)
    assert result.mailbox_credentials >= 1
    assert result.oauth_tokens >= 1
    assert result.llm_api_keys >= 1

    rotated_account = (
        await session.execute(select(EmailAccount).where(EmailAccount.id == account.id))
    ).scalar_one()
    rotated_provider = (
        await session.execute(select(LLMProvider).where(LLMProvider.id == provider.id))
    ).scalar_one()
    new_only = SecretManager([new_key])
    assert new_only.decrypt(rotated_account.encrypted_credentials)["password"] == "imap-secret"
    assert new_only.decrypt(rotated_account.encrypted_oauth)["refresh_token"] == "oauth-secret"
    assert new_only.decrypt(rotated_provider.encrypted_api_key)["api_key"] == "provider-secret"


@pytest.mark.asyncio
async def test_validation_fails_cleanly_when_rotation_key_is_missing(session, monkeypatch):
    old_key = Fernet.generate_key().decode()
    wrong_key = Fernet.generate_key().decode()
    suffix = uuid4().hex[:8]
    org = Organization(name="Wrong key", slug=f"wrong-key-{suffix}", plan="free")
    session.add(org)
    await session.flush()
    account = EmailAccount(
        org_id=org.id,
        owner_user_id=None,
        ownership_mode="shared",
        imap_host="imap.example.com",
        username=f"wrong-key-{suffix}@example.com",
        encrypted_credentials=SecretManager([old_key]).encrypt({"password": "never-leak"}),
    )
    session.add(account)
    await session.commit()

    monkeypatch.setattr(settings, "SECRET_ENCRYPTION_KEYS", wrong_key)
    monkeypatch.setattr(settings, "SECRET_KEY", wrong_key)

    with pytest.raises(SecretConfigurationError) as exc:
        await validate_stored_secrets(session)
    assert "never-leak" not in str(exc.value)
