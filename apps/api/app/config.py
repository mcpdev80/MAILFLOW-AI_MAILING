"""Application configuration from environment variables."""

from __future__ import annotations

from typing import Annotated
from urllib.parse import urlparse

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://mailflow:mailflow@localhost:5432/mailflow"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str
    SECRET_ENCRYPTION_KEYS: str = ""

    CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    API_DOCS_ENABLED: bool = False

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

    BACKFILL_BATCH_SIZE: int = Field(default=10, ge=1, le=100)
    BACKFILL_MAX_ATTEMPTS: int = Field(default=3, ge=1, le=20)
    BACKFILL_REQUEUE_DELAY_SECONDS: float = Field(default=1.0, ge=0.0, le=60.0)

    CLASSIFICATION_CONFIDENCE_THRESHOLD: float = Field(default=0.85, ge=0.0, le=1.0)

    DECISION_MEMORY_REUSE_THRESHOLD: float = Field(default=0.93, ge=0.0, le=1.0)
    DECISION_MEMORY_HINT_THRESHOLD: float = Field(default=0.68, ge=0.0, le=1.0)
    DECISION_MEMORY_DECAY_DAYS: int = Field(default=180, gt=0)

    ATTACHMENT_MAX_BYTES: int = Field(default=5 * 1024 * 1024, gt=0)
    ATTACHMENT_MAX_EXTRACTED_CHARS: int = Field(default=8_000, gt=0)
    ATTACHMENT_MAX_COUNT: int = Field(default=2, gt=0)
    ATTACHMENT_MAX_PDF_PAGES: int = Field(default=50, gt=0)
    ATTACHMENT_MAX_ARCHIVE_ENTRIES: int = Field(default=64, gt=0)
    ATTACHMENT_MAX_ARCHIVE_UNCOMPRESSED_BYTES: int = Field(
        default=2 * 1024 * 1024,
        gt=0,
    )

    CLASSIFICATION_STAGE_0_ROLE: str = "fast"
    CLASSIFICATION_STAGE_1_ROLE: str = "fast"
    CLASSIFICATION_STAGE_2_ROLE: str = "deep"
    CLASSIFICATION_STAGE_3_ROLE: str = "deep"
    THREAD_SUMMARY_MODEL_ROLE: str = "fast"

    LLM_FAST_TIMEOUT_SECONDS: float = Field(default=12.0, gt=0)
    LLM_FAST_MAX_RETRIES: int = Field(default=1, ge=0, le=10)
    LLM_DEEP_TIMEOUT_SECONDS: float = Field(default=45.0, gt=0)
    LLM_DEEP_MAX_RETRIES: int = Field(default=1, ge=0, le=10)
    LLM_GENERATION_TIMEOUT_SECONDS: float = Field(default=60.0, gt=0)
    LLM_GENERATION_MAX_RETRIES: int = Field(default=1, ge=0, le=10)
    LLM_CIRCUIT_FAILURE_THRESHOLD: int = Field(default=3, gt=0)
    LLM_CIRCUIT_RESET_SECONDS: float = Field(default=60.0, gt=0)
    LLM_HEALTH_TTL_SECONDS: int = Field(default=180, gt=0)

    WORKLOAD_GLOBAL_CONCURRENCY: int = Field(default=3, ge=1, le=128)
    WORKLOAD_FAST_CONCURRENCY: int = Field(default=2, ge=1, le=128)
    WORKLOAD_DEEP_CONCURRENCY: int = Field(default=1, ge=1, le=128)
    WORKLOAD_GENERATION_CONCURRENCY: int = Field(default=1, ge=1, le=128)
    WORKLOAD_PER_ACCOUNT_CONCURRENCY: int = Field(default=1, ge=1, le=128)
    WORKLOAD_LIVE_RESERVED_SLOTS: int = Field(default=1, ge=0, le=127)
    WORKLOAD_QUEUE_MAX: int = Field(default=500, ge=1, le=100_000)
    WORKLOAD_WAIT_TIMEOUT_SECONDS: float = Field(default=300.0, gt=0)
    WORKLOAD_LEASE_SECONDS: float = Field(default=180.0, gt=0)
    WORKLOAD_POLL_INTERVAL_SECONDS: float = Field(default=0.05, gt=0, le=5.0)
    WORKLOAD_FAST_REQUESTS_PER_MINUTE: int = Field(default=0, ge=0)
    WORKLOAD_DEEP_REQUESTS_PER_MINUTE: int = Field(default=0, ge=0)
    WORKLOAD_GENERATION_REQUESTS_PER_MINUTE: int = Field(default=0, ge=0)
    WORKLOAD_FAST_MIN_DELAY_SECONDS: float = Field(default=0.0, ge=0)
    WORKLOAD_DEEP_MIN_DELAY_SECONDS: float = Field(default=0.0, ge=0)
    WORKLOAD_GENERATION_MIN_DELAY_SECONDS: float = Field(default=0.0, ge=0)

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

    @field_validator("AUTH_MODE", "ENVIRONMENT", mode="before")
    @classmethod
    def _normalize_lowercase(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator(
        "CLASSIFICATION_STAGE_0_ROLE",
        "CLASSIFICATION_STAGE_1_ROLE",
        "CLASSIFICATION_STAGE_2_ROLE",
        "CLASSIFICATION_STAGE_3_ROLE",
        "THREAD_SUMMARY_MODEL_ROLE",
        mode="before",
    )
    @classmethod
    def _normalize_model_role(cls, value: object) -> object:
        if isinstance(value, str):
            role = value.strip().lower()
            if role not in {"fast", "deep"}:
                raise ValueError("classification model role must be fast or deep")
            return role
        return value

    @model_validator(mode="after")
    def _validate_security_and_limits(self) -> "Settings":
        if self.ENVIRONMENT == "production":
            if "*" in self.CORS_ORIGINS:
                raise ValueError(
                    "production CORS_ORIGINS must not contain wildcard origins"
                )
            for origin in self.CORS_ORIGINS:
                parsed = urlparse(origin)
                if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                    raise ValueError(
                        "CORS_ORIGINS entries must be absolute http(s) origins"
                    )
                if parsed.scheme != "https" and parsed.hostname not in {
                    "localhost",
                    "127.0.0.1",
                    "::1",
                }:
                    raise ValueError(
                        "production CORS origins must use HTTPS outside localhost"
                    )

        if self.DECISION_MEMORY_HINT_THRESHOLD > self.DECISION_MEMORY_REUSE_THRESHOLD:
            raise ValueError(
                "DecisionMemory hint threshold must not exceed reuse threshold"
            )
        if self.WORKLOAD_LIVE_RESERVED_SLOTS >= self.WORKLOAD_GLOBAL_CONCURRENCY:
            raise ValueError(
                "WORKLOAD_LIVE_RESERVED_SLOTS must be smaller than WORKLOAD_GLOBAL_CONCURRENCY"
            )
        for role_limit in (
            self.WORKLOAD_FAST_CONCURRENCY,
            self.WORKLOAD_DEEP_CONCURRENCY,
            self.WORKLOAD_GENERATION_CONCURRENCY,
            self.WORKLOAD_PER_ACCOUNT_CONCURRENCY,
        ):
            if role_limit > self.WORKLOAD_GLOBAL_CONCURRENCY:
                raise ValueError(
                    "workload role/account limits must not exceed global concurrency"
                )
        if self.WORKLOAD_LEASE_SECONDS < max(
            self.LLM_FAST_TIMEOUT_SECONDS,
            self.LLM_DEEP_TIMEOUT_SECONDS,
            self.LLM_GENERATION_TIMEOUT_SECONDS,
        ):
            raise ValueError(
                "WORKLOAD_LEASE_SECONDS must cover the longest LLM timeout"
            )
        return self

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
