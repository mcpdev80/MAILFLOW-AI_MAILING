"""Shared fixtures for apps/api tests.

Repository tests use a real PostgreSQL database. Multi-user authorization also
needs the small Better Auth ``member`` boundary because the production web and
API layers intentionally share PostgreSQL while owning separate schemas.
"""

from __future__ import annotations

import pytest
from app.models import Base
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

TEST_DATABASE_URL = (
    "postgresql+asyncpg://mailflow:mailflow@localhost:5432/mailflow_test"
)


@pytest.fixture(scope="session")
async def db_engine():
    """Create the API schema and minimal Better Auth membership test boundary."""
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(
            text(
                'CREATE TABLE IF NOT EXISTS "member" ('
                '"id" text PRIMARY KEY, '
                '"organizationId" text NOT NULL, '
                '"userId" text NOT NULL, '
                '"role" text NOT NULL'
                ")"
            )
        )
    yield engine
    async with engine.begin() as conn:
        await conn.execute(text('DROP TABLE IF EXISTS "member"'))
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture()
async def session(db_engine) -> AsyncSession:
    """Yield an isolated test session; tests use unique ids when they commit."""
    factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with factory() as s:
        yield s
        await s.rollback()


@pytest.fixture()
def session_factory(db_engine):
    """Return a real async session factory pointing to the test database."""
    return async_sessionmaker(db_engine, expire_on_commit=False)
