"""Database-level validation and rotation for encrypted application secrets."""

from __future__ import annotations

from dataclasses import dataclass

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


async def validate_stored_secrets(session: AsyncSession) -> int:
    """Decrypt every stored application secret and return the number validated.

    This intentionally runs at startup because a missing rotation fallback key
    must be detected before workers start processing mail with unusable secrets.
    """
    validated = 0

    accounts = list((await session.execute(select(EmailAccount))).scalars())
    for account in accounts:
        if account.encrypted_credentials:
            decrypt_secret(account.encrypted_credentials)
            validated += 1
        if account.encrypted_oauth:
            decrypt_secret(account.encrypted_oauth)
            validated += 1

    providers = list((await session.execute(select(LLMProvider))).scalars())
    for provider in providers:
        if provider.encrypted_api_key:
            decrypt_secret(provider.encrypted_api_key)
            validated += 1

    return validated


async def rotate_stored_secrets(session: AsyncSession) -> SecretRotationResult:
    """Re-encrypt all DB secrets with the current primary encryption key."""
    mailbox_credentials = 0
    oauth_tokens = 0
    llm_api_keys = 0

    accounts = list((await session.execute(select(EmailAccount))).scalars())
    for account in accounts:
        if account.encrypted_credentials:
            account.encrypted_credentials = rotate_secret(account.encrypted_credentials)
            mailbox_credentials += 1
        if account.encrypted_oauth:
            account.encrypted_oauth = rotate_secret(account.encrypted_oauth)
            oauth_tokens += 1

    providers = list((await session.execute(select(LLMProvider))).scalars())
    for provider in providers:
        if provider.encrypted_api_key:
            provider.encrypted_api_key = rotate_secret(provider.encrypted_api_key)
            llm_api_keys += 1

    await session.commit()
    return SecretRotationResult(
        mailbox_credentials=mailbox_credentials,
        oauth_tokens=oauth_tokens,
        llm_api_keys=llm_api_keys,
    )
