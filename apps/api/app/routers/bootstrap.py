"""Deployment bootstrap status for first-run UI.

Deployment tools (CLI, Compose, Helm, Operator) remain the source of truth for
infrastructure-owned values. The GUI consumes this read-only view and only asks
for values that were not provided by the deployment.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends

from app.auth import require_org
from app.models.organization import Organization

router = APIRouter(prefix="/bootstrap", tags=["bootstrap"])

_ALLOWED_SOURCES = {"cli", "compose", "helm", "operator", "environment", "default"}
_ALLOWED_LANGUAGES = {"de", "en", "es"}
_ALLOWED_TLS_MODES = {"automatic", "custom", "external", "none"}


def _clean(name: str) -> str:
    return os.getenv(name, "").strip()


def _source() -> str:
    value = _clean("MAILFLOW_DEPLOYMENT_SOURCE").lower()
    return value if value in _ALLOWED_SOURCES else "environment"


def _field(value: str, *, source: str, managed: bool) -> dict[str, object]:
    return {
        "value": value or None,
        "configured": bool(value),
        "source": source if value else "default",
        "managed": managed and bool(value),
    }


def build_bootstrap_status() -> dict[str, object]:
    """Build a secret-free deployment status from explicit environment values."""
    source = _source()
    public_url = _clean("MAILFLOW_PUBLIC_URL")
    tls_mode = _clean("MAILFLOW_TLS_MODE").lower()
    language = _clean("MAILFLOW_BOOTSTRAP_LANGUAGE").lower()

    if tls_mode not in _ALLOWED_TLS_MODES:
        # Backward-compatible inference for deployments created before the
        # explicit TLS mode variable existed.
        tls_mode = "custom" if _clean("TLS_CERT_FILE") and _clean("TLS_KEY_FILE") else ""
    if language not in _ALLOWED_LANGUAGES:
        language = ""

    return {
        "deployment_source": source,
        "fields": {
            "public_url": _field(public_url, source=source, managed=True),
            "tls": _field(tls_mode, source=source, managed=True),
            # Language is an initial deployment preference. A user may override
            # it later in their personal preferences.
            "language": _field(language, source=source, managed=False),
        },
    }


@router.get("/status")
async def bootstrap_status(
    _org: Organization = Depends(require_org),
) -> dict[str, object]:
    """Return configured bootstrap values and where they came from."""
    return build_bootstrap_status()
