"""Application configuration from environment variables."""

from __future__ import annotations

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://mailflow:mailflow@localhost:5432/mailflow"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str
    SECRET_ENCRYPTION_KEYS: str = ""

    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    AUTH_MODE: str = "single"
    SINGLE_TENANT_API_KEY: str = ""

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    MICROSOFT_CLIENT_ID: str = ""
    MICROSOFT_CLIENT_SECRET: str = ""
    MICROSOFT_TENANT_ID: str = "common"
    OAUTH_REDIRECT_BASE: str = "http://localhost:8000"
    OAUTH_SUCCESS_REDIRECT: str = "http://localhost:3000/app/dashboard"

    INTERNAL_API_SECRET: str = ""

    WORKER_PAUSED: bool = False

    LIFECYCLE_AUDIT_RETENTION_DAYS: int = 180
    LIFECYCLE_CLEANUP_BATCH_SIZE: int = 500

    # Adaptive classification escalates while confidence is below this value or
    # the model explicitly requests more context/review.
    CLASSIFICATION_CONFIDENCE_THRESHOLD: float = Field(default=0.85, ge=0.0, le=1.0)

    LOG_FORMAT: str = "json"
    LOG_LEVEL: str = "INFO"
    ENVIRONMENT: str = "development"
    SENTRY_DSN: str = ""
    SENTRY_TRACES_SAMPLE_RATE: float = 0.0

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
