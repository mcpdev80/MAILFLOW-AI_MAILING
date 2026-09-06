"""Routers HTTP de la API, agrupados por dominio."""

from __future__ import annotations

from app.routers.accounts import router as accounts_router
from app.routers.attachments import router as attachments_router
from app.routers.attention import router as attention_router
from app.routers.audit import router as audit_router
from app.routers.backfill import router as backfill_router
from app.routers.billing import router as billing_router
from app.routers.bootstrap import router as bootstrap_router
from app.routers.bulk import router as bulk_router
from app.routers.cycles import router as cycles_router
from app.routers.dashboard import router as dashboard_router
from app.routers.decision_memory import router as decision_memory_router
from app.routers.inference_health import router as inference_health_router
from app.routers.internal import router as internal_router
from app.routers.lifecycle import router as lifecycle_router
from app.routers.llm_providers import router as llm_providers_router
from app.routers.mail import router as mail_router
from app.routers.mail_client import router as mail_client_router
from app.routers.metrics import router as metrics_router
from app.routers.oauth import router as oauth_router
from app.routers.rules import router as rules_router
from app.routers.structure import router as structure_router
from app.routers.user_preferences import router as user_preferences_router
from app.routers.workload import router as workload_router
from app.routers.writing import router as writing_router

__all__ = [
    "accounts_router",
    "attachments_router",
    "attention_router",
    "audit_router",
    "backfill_router",
    "billing_router",
    "bootstrap_router",
    "bulk_router",
    "cycles_router",
    "dashboard_router",
    "decision_memory_router",
    "inference_health_router",
    "internal_router",
    "lifecycle_router",
    "llm_providers_router",
    "mail_client_router",
    "mail_router",
    "metrics_router",
    "oauth_router",
    "rules_router",
    "structure_router",
    "user_preferences_router",
    "workload_router",
    "writing_router",
]
