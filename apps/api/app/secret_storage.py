"""Database-level validation and rotation for encrypted application secrets."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto import decrypt_secret, rotate_secret
from app.models.email_account import EmailAccount
from app.models.llm_provider import LLMProvider


@dataclass(frozen=True)
class SecretRotationResult:
    mailbox_credentials: int = 0
    oauth_tokens: int = 0
    llm_api_keys: int = 0

    @property
    def total(self) -> int:
        return self.mailbox_credentials + self.oauth_tokens + self.llm_api_keys


def _account_query(org_id: UUID | None):
    stmt = select(EmailAccount)
    return stmt.where(EmailAccount.org_id == org_id) if org_id else stmt


def _provider_query(org_id: UUID | None):
    stmt = select(LLMProvider)
    return stmt.where(LLMProvider.org_id == org_id) if org_id else stmt


def _provider_secret_fields(provider: LLMProvider) -> tuple[tuple[str, str | None], ...]:
    return (
        ("encrypted_api_key", provider.encrypted_api_key),
        ("encrypted_fast_api_key", provider.encrypted_fast_api_key),
        ("encrypted_deep_api_key", provider.encrypted_deep_api_key),
        ("encrypted_generation_api_key", provider.encrypted_generation_api_key),
    )


async def validate_stored_secrets(
    session: AsyncSession, *, org_id: UUID | None = None
) -> int:
    """Decrypt stored application secrets and return the number validated."""
    validated = 0

    accounts = list((await session.execute(_account_query(org_id))).scalars())
    for account in accounts:
        if account.encrypted_credentials:
            decrypt_secret(account.encrypted_credentials)
            validated += 1
        if account.encrypted_oauth:
            decrypt_secret(account.encrypted_oauth)
            validated += 1

    providers = list((await session.execute(_provider_query(org_id))).scalars())
    for provider in providers:
        for _field_name, encrypted_value in _provider_secret_fields(provider):
            if encrypted_value:
                decrypt_secret(encrypted_value)
                validated += 1

    return validated


async def rotate_stored_secrets(
    session: AsyncSession, *, org_id: UUID | None = None
) -> SecretRotationResult:
    """Re-encrypt stored DB secrets with the current primary encryption key."""
    mailbox_credentials = 0
    oauth_tokens = 0
    llm_api_keys = 0

    accounts = list((await session.execute(_account_query(org_id))).scalars())
    for account in accounts:
        if account.encrypted_credentials:
            account.encrypted_credentials = rotate_secret(account.encrypted_credentials)
            mailbox_credentials += 1
        if account.encrypted_oauth:
            account.encrypted_oauth = rotate_secret(account.encrypted_oauth)
            oauth_tokens += 1

    providers = list((await session.execute(_provider_query(org_id))).scalars())
    for provider in providers:
        for field_name, encrypted_value in _provider_secret_fields(provider):
            if encrypted_value:
                setattr(provider, field_name, rotate_secret(encrypted_value))
                llm_api_keys += 1

    await session.commit()
    return SecretRotationResult(
        mailbox_credentials=mailbox_credentials,
        oauth_tokens=oauth_tokens,
        llm_api_keys=llm_api_keys,
    )
