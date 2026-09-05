"""Tests for app.config.Settings security-sensitive parsing and validation."""

from __future__ import annotations

import pytest

_FAKE_KEY = "qdCa5nGhLjd8qY0CCaQP2dE000lbSYDmtPnhzAVeVgs="


def _make_settings(**env: object):
    from app.config import Settings

    return Settings(SECRET_KEY=_FAKE_KEY, **env)


def test_cors_origins_default_is_local_frontend():
    settings = _make_settings()
    assert settings.CORS_ORIGINS == ["http://localhost:3000"]


def test_cors_origins_parses_csv_string():
    settings = _make_settings(
        CORS_ORIGINS="https://app.mailflow.ai, https://mailflow.ai"
    )
    assert settings.CORS_ORIGINS == ["https://app.mailflow.ai", "https://mailflow.ai"]


def test_cors_origins_csv_ignores_blanks():
    settings = _make_settings(CORS_ORIGINS="https://a.com,,  ,https://b.com")
    assert settings.CORS_ORIGINS == ["https://a.com", "https://b.com"]


def test_cors_origins_accepts_list():
    settings = _make_settings(CORS_ORIGINS=["https://only.com"])
    assert settings.CORS_ORIGINS == ["https://only.com"]


def test_production_allows_no_cors_origins_for_same_origin_bff():
    settings = _make_settings(ENVIRONMENT="production", CORS_ORIGINS="")
    assert settings.CORS_ORIGINS == []


def test_production_rejects_wildcard_cors():
    with pytest.raises(ValueError, match="wildcard"):
        _make_settings(ENVIRONMENT="production", CORS_ORIGINS="*")


def test_production_rejects_plain_http_remote_origin():
    with pytest.raises(ValueError, match="HTTPS"):
        _make_settings(
            ENVIRONMENT="production",
            CORS_ORIGINS="http://mail.example.com",
        )


def test_production_accepts_https_origin():
    settings = _make_settings(
        ENVIRONMENT="production",
        CORS_ORIGINS="https://mail.example.com",
    )
    assert settings.CORS_ORIGINS == ["https://mail.example.com"]


def test_api_docs_disabled_by_default():
    assert _make_settings().API_DOCS_ENABLED is False
