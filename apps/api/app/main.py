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
    attention_router,
    audit_router,
    backfill_router,
    billing_router,
    bulk_router,
    cycles_router,
    dashboard_router,
    decision_memory_router,
    inference_health_router,
    internal_router,
    lifecycle_router,
    llm_providers_router,
    mail_client_router,
    mail_router,
    metrics_router,
    oauth_router,
    rules_router,
    structure_router,
    user_preferences_router,
    workload_router,
    writing_router,
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
app.include_router(attention_router)
app.include_router(audit_router)
app.include_router(backfill_router)
app.include_router(bulk_router)
app.include_router(dashboard_router)
app.include_router(lifecycle_router)
app.include_router(llm_providers_router)
app.include_router(mail_router)
app.include_router(mail_client_router)
app.include_router(writing_router)
app.include_router(rules_router)
app.include_router(structure_router)
app.include_router(user_preferences_router)
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
            "Startup aborted before background processing."
        )
        raise
    logger.info(
        "Startup security checks passed schema_revision=%s encrypted_secrets=%s",
        revision,
        count,
    )


@app.middleware("http")
async def security_headers(request, call_next):
    start = time.monotonic()
    try:
        response = await call_next(request)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unhandled request failure: %s", redact_text(str(exc)))
        response = JSONResponse(status_code=500, content={"detail": "internal_error"})
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    )
    response.headers["X-Response-Time"] = f"{time.monotonic() - start:.3f}s"
    return response


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/ready")
async def ready():
    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    return {"status": "ready"}
