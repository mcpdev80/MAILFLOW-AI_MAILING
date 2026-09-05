"""MailFlow API entry point."""

from __future__ import annotations

import logging
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import settings
from app.database import async_session_factory
from app.logging_config import setup_logging
from app.middleware import RequestIdMiddleware
from app.observability import init_sentry
from app.restore_validation import RestoreValidationError, validate_schema_revision
from app.routers import (
    accounts_router,
    audit_router,
    backfill_router,
    billing_router,
    bulk_router,
    cycles_router,
    decision_memory_router,
    inference_health_router,
    internal_router,
    lifecycle_router,
    llm_providers_router,
    mail_router,
    metrics_router,
    oauth_router,
    rules_router,
    structure_router,
    workload_router,
)
from app.secret_storage import validate_stored_secrets
from app.secrets import SecretConfigurationError, redact_text

setup_logging()
init_sentry()
logger = logging.getLogger("mailflow.api")

_docs_url = "/docs" if settings.API_DOCS_ENABLED else None
_openapi_url = "/openapi.json" if settings.API_DOCS_ENABLED else None

app = FastAPI(
    title="MailFlow API",
    version="0.1.0",
    description="Open source AI email assistant API",
    docs_url=_docs_url,
    redoc_url=None,
    openapi_url=_openapi_url,
)

app.add_middleware(RequestIdMiddleware)
if settings.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Request-ID"],
    )

app.include_router(accounts_router)
app.include_router(audit_router)
app.include_router(backfill_router)
app.include_router(bulk_router)
app.include_router(lifecycle_router)
app.include_router(llm_providers_router)
app.include_router(mail_router)
app.include_router(rules_router)
app.include_router(structure_router)
app.include_router(decision_memory_router)
app.include_router(cycles_router)
app.include_router(inference_health_router)
app.include_router(workload_router)
app.include_router(oauth_router)
app.include_router(billing_router)
app.include_router(internal_router)
app.include_router(metrics_router)


@app.on_event("startup")
async def _startup_security_checks() -> None:
    """Validate schema compatibility, authentication defaults and stored secrets."""
    if settings.AUTH_MODE == "single" and not settings.SINGLE_TENANT_API_KEY:
        logger.warning(
            "SECURITY: API is OPEN (AUTH_MODE=single without SINGLE_TENANT_API_KEY). "
            "Set SINGLE_TENANT_API_KEY before exposing this instance to the internet."
        )

    try:
        async with async_session_factory() as session:
            revision = await validate_schema_revision(session)
            count = await validate_stored_secrets(session)
    except RestoreValidationError as exc:
        logger.critical("Database schema validation failed: %s", exc)
        raise
    except SecretConfigurationError:
        logger.critical(
            "Encrypted application secrets cannot be decrypted with the configured key ring. "
            "Restore the matching deployment key or add the previous key as a rotation fallback."
        )
        raise
    logger.info(
        "Validated database schema revision %s and %d encrypted application secrets",
        revision,
        count,
    )


@app.get("/health")
async def health() -> JSONResponse:
    started = time.monotonic()
    db_ok = False
    error: str | None = None
    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
        db_ok = True
    except Exception as exc:  # noqa: BLE001 — health must never raise
        error = redact_text(str(exc))
        logger.warning("health check DB probe failed: %s", error)

    payload: dict[str, object] = {
        "status": "ok" if db_ok else "degraded",
        "db": "up" if db_ok else "down",
        "version": "0.1.0",
        "latency_ms": round((time.monotonic() - started) * 1000, 1),
    }
    if error:
        payload["error"] = error
    return JSONResponse(
        payload,
        status_code=200 if db_ok else 503,
        headers={"Cache-Control": "no-store"},
    )


@app.get("/")
async def root() -> dict[str, str]:
    payload = {"message": "MailFlow API"}
    if settings.API_DOCS_ENABLED:
        payload["docs"] = "/docs"
    return payload
