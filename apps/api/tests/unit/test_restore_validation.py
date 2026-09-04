"""Restore validation tests."""

from __future__ import annotations

import pytest

from app.restore_validation import (
    EXPECTED_SCHEMA_REVISION,
    RestoreValidationError,
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
