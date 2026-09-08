"""Authenticated discovery endpoint for the provider-neutral assistant surface."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.assistant.tools import default_tool_registry
from app.auth import RequestIdentity, require_identity
from app.config import settings

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.get("/capabilities")
async def assistant_capabilities(
    _identity: RequestIdentity = Depends(require_identity),
) -> dict[str, object]:
    registry = default_tool_registry()
    return {
        "enabled": settings.ASSISTANT_RUNTIME != "disabled",
        "runtime": settings.ASSISTANT_RUNTIME,
        "platform_backend": settings.PLATFORM_BACKEND,
        "tools": [
            {
                "name": tool.name,
                "safety": tool.safety.value,
                "confirmation_required": tool.confirmation_required,
            }
            for tool in registry.all()
        ],
        "contracts": {
            "openai_compatible": bool(settings.OPENAI_BASE_URL),
            "mcp": bool(settings.MCP_ENDPOINT),
            "openbao": bool(settings.OPENBAO_ADDR),
            "oidc": bool(settings.OIDC_ISSUER),
            "s3": bool(settings.S3_ENDPOINT),
            "otel": bool(settings.OTEL_EXPORTER_OTLP_ENDPOINT),
        },
    }
