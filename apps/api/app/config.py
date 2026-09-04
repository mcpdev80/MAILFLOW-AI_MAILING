"""Application configuration from environment variables."""

from __future__ import annotations

from pydantic import Field, field_validator, model_validator
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

    # DecisionMemory is conservative by default: only very strong trusted matches
    # bypass classification while weaker matches may be supplied as hints.
    DECISION_MEMORY_REUSE_THRESHOLD: float = Field(default=0.93, ge=0.0, le=1.0)
    DECISION_MEMORY_HINT_THRESHOLD: float = Field(default=0.68, ge=0.0, le=1.0)
    DECISION_MEMORY_DECAY_DAYS: int = Field(default=180, gt=0)

    # Attachment extraction is optional escalation context. Keep all limits
    # centrally configurable so deployments can tune local resource use safely.
    ATTACHMENT_MAX_BYTES: int = Field(default=5 * 1024 * 1024, gt=0)
    ATTACHMENT_MAX_EXTRACTED_CHARS: int = Field(default=8_000, gt=0)
    ATTACHMENT_MAX_COUNT: int = Field(default=2, gt=0)
    ATTACHMENT_MAX_PDF_PAGES: int = Field(default=50, gt=0)
    ATTACHMENT_MAX_ARCHIVE_ENTRIES: int = Field(default=64, gt=0)
    ATTACHMENT_MAX_ARCHIVE_UNCOMPRESSED_BYTES: int = Field(
        default=2 * 1024 * 1024,
        gt=0,
    )

    # Global stage-to-model defaults. Account-level role overrides can be added
    # later without changing the adaptive classifier contract.
    CLASSIFICATION_STAGE_0_ROLE: str = "fast"
    CLASSIFICATION_STAGE_1_ROLE: str = "fast"
    CLASSIFICATION_STAGE_2_ROLE: str = "deep"
    CLASSIFICATION_STAGE_3_ROLE: str = "deep"
    THREAD_SUMMARY_MODEL_ROLE: str = "fast"

    # LLM resilience. Fast classification should fail quickly; deep/generation
    # get a little more time. LiteLLM retries remain bounded and are independent
    # of ARQ job retries.
    LLM_FAST_TIMEOUT_SECONDS: float = Field(default=12.0, gt=0)
    LLM_FAST_MAX_RETRIES: int = Field(default=1, ge=0, le=10)
    LLM_DEEP_TIMEOUT_SECONDS: float = Field(default=45.0, gt=0)
    LLM_DEEP_MAX_RETRIES: int = Field(default=1, ge=0, le=10)
    LLM_GENERATION_TIMEOUT_SECONDS: float = Field(default=60.0, gt=0)
    LLM_GENERATION_MAX_RETRIES: int = Field(default=1, ge=0, le=10)
    LLM_CIRCUIT_FAILURE_THRESHOLD: int = Field(default=3, gt=0)
    LLM_CIRCUIT_RESET_SECONDS: float = Field(default=60.0, gt=0)
    LLM_HEALTH_TTL_SECONDS: int = Field(default=180, gt=0)

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
    def _validate_memory_thresholds(self) -> "Settings":
        if self.DECISION_MEMORY_HINT_THRESHOLD > self.DECISION_MEMORY_REUSE_THRESHOLD:
            raise ValueError(
                "DecisionMemory hint threshold must not exceed reuse threshold"
            )
        return self

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
