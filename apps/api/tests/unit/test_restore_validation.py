"""Restore validation tests."""

from __future__ import annotations

import pytest

import app.restore_validation as restore_validation
from app.restore_validation import (
    EXPECTED_SCHEMA_REVISION,
    RestoreValidationError,
    validate_restore_state,
    validate_schema_revision,
)


class FakeSchemaSession:
    def __init__(
        self,
        *,
        revision: str | None,
        has_version_table: bool = True,
    ):
        self.revision = revision
        self.has_version_table = has_version_table

    async def scalar(self, statement, params=None):
        query = str(statement)
        if "to_regclass" in query:
            return self.has_version_table
        if "SELECT version_num FROM alembic_version" in query:
            return self.revision
        raise AssertionError(f"Unexpected query: {query}")


class FakeInvalidOwnershipSession:
    async def scalar(self, statement, params=None):
        query = str(statement)
        if "ownership_mode = 'private' AND owner_user_id IS NULL" in query:
            return 1
        if "ownership_mode = 'private'" in query:
            return 1
        if "ownership_mode = 'shared'" in query:
            return 0
        raise AssertionError(f"Unexpected query: {query}")


async def test_schema_validation_accepts_expected_revision():
    session = FakeSchemaSession(revision=EXPECTED_SCHEMA_REVISION)
    assert await validate_schema_revision(session) == EXPECTED_SCHEMA_REVISION


async def test_schema_validation_rejects_old_revision():
    session = FakeSchemaSession(revision="006")
    with pytest.raises(
        RestoreValidationError,
        match="Unsupported database schema revision",
    ):
        await validate_schema_revision(session)


async def test_schema_validation_rejects_unversioned_database():
    session = FakeSchemaSession(revision=None, has_version_table=False)
    with pytest.raises(
        RestoreValidationError,
        match="no Alembic schema revision",
    ):
        await validate_schema_revision(session)


async def test_restore_validation_rejects_private_mailbox_without_owner(monkeypatch):
    async def schema_ok(session):
        return EXPECTED_SCHEMA_REVISION

    async def secrets_ok(session):
        return 0

    monkeypatch.setattr(restore_validation, "validate_schema_revision", schema_ok)
    monkeypatch.setattr(restore_validation, "validate_stored_secrets", secrets_ok)
    monkeypatch.setattr(restore_validation.settings, "AUTH_MODE", "single")

    with pytest.raises(
        RestoreValidationError,
        match="private mailboxes without an owner",
    ):
        await validate_restore_state(FakeInvalidOwnershipSession())
