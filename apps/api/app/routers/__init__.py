"""Routers HTTP de la API, agrupados por dominio."""

from __future__ import annotations

from app.routers.accounts import router as accounts_router
from app.routers.billing import router as billing_router
from app.routers.cycles import router as cycles_router
from app.routers.decision_memory import router as decision_memory_router
from app.routers.inference_health import router as inference_health_router
from app.routers.internal import router as internal_router
from app.routers.lifecycle import router as lifecycle_router
from app.routers.llm_providers import router as llm_providers_router
from app.routers.metrics import router as metrics_router
from app.routers.oauth import router as oauth_router
from app.routers.rules import router as rules_router

__all__ = [
    "accounts_router",
    "billing_router",
    "cycles_router",
    "decision_memory_router",
    "inference_health_router",
    "internal_router",
    "lifecycle_router",
    "llm_providers_router",
    "metrics_router",
    "oauth_router",
    "rules_router",
]
