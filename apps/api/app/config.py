"""Application configuration from environment variables."""

from __future__ import annotations

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://mailflow:mailflow@localhost:5432/mailflow"
    REDIS_URL: str = "redis://localhost:6379/0"
    # Existing deployment secret. It remains the HMAC/signing secret and is also
    # accepted as the legacy Fernet encryption key for backward compatibility.
    SECRET_KEY: str
    # Optional comma-separated Fernet key ring for DB secrets. The first key is
    # primary for new writes; later keys are decrypt-only fallbacks during key
    # rotation. SECRET_KEY is appended automatically as a legacy fallback.
    SECRET_ENCRYPTION_KEYS: str = ""

    # Allowed CORS origins. Comma-separated in the environment variable.
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Authentication mode:
    #   "single" — self-host: one default organization, no user tokens.
    #   "multi"  — each request carries an organization API key plus actor BFF identity.
    AUTH_MODE: str = "single"
    SINGLE_TENANT_API_KEY: str = ""

    # OAuth2. Empty values disable the corresponding provider.
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    MICROSOFT_CLIENT_ID: str = ""
    MICROSOFT_CLIENT_SECRET: str = ""
    MICROSOFT_TENANT_ID: str = "common"
    OAUTH_REDIRECT_BASE: str = "http://localhost:8000"
    OAUTH_SUCCESS_REDIRECT: str = "http://localhost:3000/app/dashboard"

    # Shared web↔api internal signing secret. Never expose publicly.
    INTERNAL_API_SECRET: str = ""

    # Observability.
    LOG_FORMAT: str = "json"
    LOG_LEVEL: str = "INFO"
    ENVIRONMENT: str = "development"
    SENTRY_DSN: str = ""
    SENTRY_TRACES_SAMPLE_RATE: float = 0.0

    # Billing.
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_PRO: str = ""
    STRIPE_PRICE_TEAM: str = ""
    BILLING_SUCCESS_URL: str = "http://localhost:3000/app/billing?status=success"
    BILLING_CANCEL_URL: str = "http://localhost:3000/app/billing?status=cancel"

    @field_validator("AUTH_MODE", mode="before")
    @classmethod
    def _normalize_auth_mode(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
