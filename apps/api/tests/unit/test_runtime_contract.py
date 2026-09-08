"""Runtime contract compatibility tests."""

from app.runtime_contract import sqlalchemy_async_database_url


def test_standard_postgresql_url_is_accepted_without_baseharbor_runtime() -> None:
    url = "postgresql://mailflow:secret@127.0.0.1:55432/mailflow"

    assert sqlalchemy_async_database_url(url) == (
        "postgresql+asyncpg://mailflow:secret@127.0.0.1:55432/mailflow"
    )


def test_legacy_postgres_url_is_accepted() -> None:
    url = "postgres://mailflow:secret@db.example:5432/mailflow?sslmode=require"

    assert sqlalchemy_async_database_url(url) == (
        "postgresql+asyncpg://mailflow:secret@db.example:5432/mailflow?sslmode=require"
    )


def test_explicit_sqlalchemy_driver_url_is_preserved() -> None:
    url = "postgresql+asyncpg://mailflow:secret@postgres:5432/mailflow"

    assert sqlalchemy_async_database_url(url) == url
