"""Adapters for standard runtime contracts supplied by deployment environments."""

from __future__ import annotations


def sqlalchemy_async_database_url(database_url: str) -> str:
    """Return a SQLAlchemy asyncpg URL without requiring a provider-specific input.

    MailFlow's public runtime contract accepts the conventional PostgreSQL URL forms
    used by BaseHarbor and other platforms. The API converts them internally to the
    async SQLAlchemy driver it uses; callers never need a MailFlow/BaseHarbor-specific
    connection string.
    """
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+asyncpg://", 1)
    return database_url
