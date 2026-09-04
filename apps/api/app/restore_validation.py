"""Restore and schema validation for persistent MailFlow state."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.secret_storage import validate_stored_secrets

EXPECTED_SCHEMA_REVISION = "018"


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
            f"Unsupported database schema revision {revision!r}; "
            f"expected {EXPECTED_SCHEMA_REVISION!r}"
        )
    return str(revision)


async def _validate_mailbox_ownership(session: AsyncSession) -> tuple[int, int]:
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

    invalid_private = int(
        await session.scalar(
            text(
                "SELECT count(*) FROM email_accounts "
                "WHERE ownership_mode = 'private' AND owner_user_id IS NULL"
            )
        )
        or 0
    )
    if invalid_private:
        raise RestoreValidationError(
            f"Found {invalid_private} private mailboxes without an owner"
        )

    if settings.AUTH_MODE != "multi":
        return private_count, shared_count

    required_tables = ['"user"', '"organization"', '"member"', '"passkey"']
    missing = [
        name for name in required_tables if not await _table_exists(session, name)
    ]
    if missing:
        raise RestoreValidationError(
            "Missing Better Auth tables required by multi-user restore: "
            + ", ".join(missing)
        )

    missing_org_links = int(
        await session.scalar(
            text(
                "SELECT count(*) FROM organizations mf "
                "WHERE NOT EXISTS ("
                '  SELECT 1 FROM "organization" ba '
                "  WHERE (ba.metadata::jsonb ->> 'mf_org_id') = mf.id::text"
                ")"
            )
        )
        or 0
    )
    if missing_org_links:
        raise RestoreValidationError(
            f"Found {missing_org_links} MailFlow organizations without Better Auth linkage"
        )

    invalid_private_members = int(
        await session.scalar(
            text(
                "SELECT count(*) FROM email_accounts ea "
                'JOIN "organization" ba '
                "  ON (ba.metadata::jsonb ->> 'mf_org_id') = ea.org_id::text "
                "WHERE ea.ownership_mode = 'private' "
                "  AND NOT EXISTS ("
                '    SELECT 1 FROM "member" m '
                '    WHERE m."organizationId" = ba.id '
                '      AND m."userId" = ea.owner_user_id'
                "  )"
            )
        )
        or 0
    )
    if invalid_private_members:
        raise RestoreValidationError(
            f"Found {invalid_private_members} private mailbox owners outside their organization"
        )

    invalid_shared_grants = int(
        await session.scalar(
            text(
                "SELECT count(*) FROM mailbox_access ma "
                "JOIN email_accounts ea ON ea.id = ma.account_id "
                'JOIN "organization" ba '
                "  ON (ba.metadata::jsonb ->> 'mf_org_id') = ea.org_id::text "
                "WHERE NOT EXISTS ("
                '  SELECT 1 FROM "member" m '
                '  WHERE m."organizationId" = ba.id '
                '    AND m."userId" = ma.user_id'
                ")"
            )
        )
        or 0
    )
    if invalid_shared_grants:
        raise RestoreValidationError(
            f"Found {invalid_shared_grants} mailbox grants for users outside their organization"
        )

    return private_count, shared_count


async def validate_restore_state(session: AsyncSession) -> RestoreValidationResult:
    schema_revision = await validate_schema_revision(session)
    encrypted_secrets = await validate_stored_secrets(session)
    private_mailboxes, shared_mailboxes = await _validate_mailbox_ownership(session)

    passkeys = 0
    if await _table_exists(session, '"passkey"'):
        passkeys = int(
            await session.scalar(text('SELECT count(*) FROM "passkey"')) or 0
        )

    return RestoreValidationResult(
        schema_revision=schema_revision,
        encrypted_secrets=encrypted_secrets,
        private_mailboxes=private_mailboxes,
        shared_mailboxes=shared_mailboxes,
        passkeys=passkeys,
    )
