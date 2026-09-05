"""User-controlled AI writing preview endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity, require_identity
from app.database import get_session
from app.routers.mail import _editable, _get_draft
from app.services.ai_writing import AIWritingError, generate_writing_preview
from app.writing_schemas import WritingPreview, WritingRequest

router = APIRouter(prefix="/mail", tags=["mail-writing"])


@router.post("/drafts/{draft_id}/ai/preview", response_model=WritingPreview)
async def preview_ai_writing(
    draft_id: UUID,
    payload: WritingRequest,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> WritingPreview:
    """Generate a preview only; this endpoint never mutates or sends the draft."""
    draft = await _get_draft(draft_id, identity, session)
    _editable(draft)
    try:
        text, context = await generate_writing_preview(session, draft, payload)
    except AIWritingError as exc:
        detail = str(exc)
        status_code = 503 if detail == "generation_model_unavailable" else 502
        raise HTTPException(status_code=status_code, detail=detail) from exc
    return WritingPreview(
        action=payload.action,
        scope=payload.scope,
        text=text,
        used_thread_context=context.used_thread_context,
        used_current_message=context.used_current_message,
    )
