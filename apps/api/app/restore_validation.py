"""Restore and schema validation for persistent MailFlow state."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.secret_storage import validate_stored_secrets

EXPECTED_SCHEMA_REVISION = "026"


class RestoreValidationError(RuntimeError):
    """Raised when restored state is unsafe to resume."""


@dataclass(frozen=True)
class RestoreValidationResult:
    schema_revision: str
    encrypted_secrets: int
    private_mailboxes: int
    shared_mailboxes: int
    passkeys: int


async def _table_exists(session: AsyncSession, table_name: str) -> bool:
    return bool(
        await session.scalar(
            text("SELECT to_regclass(:table_name) IS NOT NULL"),
            {"table_name": table_name},
        )
    )


async def validate_schema_revision(session: AsyncSession) -> str:
    if not await _table_exists(session, "alembic_version"):
        raise RestoreValidationError("Database has no Alembic schema revision")
    revision = await session.scalar(text("SELECT version_num FROM alembic_version"))
    if revision != EXPECTED_SCHEMA_REVISION:
        raise RestoreValidationError(
            f"Database schema revision {revision!r} does not match "
            f"expected {EXPECTED_SCHEMA_REVISION!r}"
        )
    return str(revision)


async def _count_mailboxes(session: AsyncSession) -> tuple[int, int]:
    if not await _table_exists(session, "email_accounts"):
        return 0, 0
    private_count = int(
        await session.scalar(
            text("SELECT count(*) FROM email_accounts WHERE ownership_mode = 'private'")
        )
        or 0
    )
    shared_count = int(
        await session.scalar(
            text("SELECT count(*) FROM email_accounts WHERE ownership_mode = 'shared'")
        )
        or 0
    )
    return private_count, shared_count


async def _count_passkeys(session: AsyncSession) -> int:
    if not await _table_exists(session, "passkey_credentials"):
        return 0
    return int(await session.scalar(text("SELECT count(*) FROM passkey_credentials")) or 0)


async def validate_restore(session: AsyncSession) -> RestoreValidationResult:
    """Validate restored state before workers are allowed to resume."""
    schema_revision = await validate_schema_revision(session)
    encrypted_secrets = await validate_stored_secrets(session, settings.secret_key)
    private_mailboxes, shared_mailboxes = await _count_mailboxes(session)
    passkeys = await _count_passkeys(session)
    return RestoreValidationResult(
        schema_revision=schema_revision,
        encrypted_secrets=encrypted_secrets,
        private_mailboxes=private_mailboxes,
        shared_mailboxes=shared_mailboxes,
        passkeys=passkeys,
    )
