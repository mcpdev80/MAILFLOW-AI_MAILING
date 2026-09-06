"""Global, permission-aware attachment library endpoints."""

from __future__ import annotations

from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.attachment_library_schemas import (
    AttachmentDocumentDetail,
    AttachmentDocumentListItem,
    AttachmentSourceOut,
    BlockedAttachmentOut,
)
from app.attachment_storage import attachment_storage
from app.auth import RequestIdentity, require_identity
from app.database import get_session
from app.repositories.attachment_library import AttachmentLibraryRepository

router = APIRouter(prefix="/attachments", tags=["attachments"])


@router.get("", response_model=list[AttachmentDocumentListItem])
async def list_attachments(
    q: str | None = None,
    account_id: UUID | None = None,
    category: str | None = None,
    mime_type: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[AttachmentDocumentListItem]:
    rows = await AttachmentLibraryRepository(session).list_accessible_documents(
        identity,
        query=q,
        account_id=account_id,
        category=category,
        mime_type=mime_type,
        limit=limit,
        offset=offset,
    )
    return [
        AttachmentDocumentListItem(
            id=document.id,
            canonical_filename=document.canonical_filename,
            mime_type=document.mime_type,
            size_bytes=document.size_bytes,
            analysis_status=document.analysis_status,
            document_type=document.document_type,
            ai_category=document.ai_category,
            ai_subcategory=document.ai_subcategory,
            ai_confidence=document.ai_confidence,
            tags=document.tags,
            user_folder_id=document.user_folder_id,
            source_count=source_count,
            created_at=document.created_at,
            updated_at=document.updated_at,
        )
        for document, source_count in rows
    ]


@router.get("/security", response_model=list[BlockedAttachmentOut])
async def blocked_attachment_metadata(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[object]:
    """Return metadata only. Blocked attachment bytes are never stored or exposed."""
    return list(
        await AttachmentLibraryRepository(session).list_accessible_blocked_sources(
            identity, limit=limit, offset=offset
        )
    )


@router.get("/{document_id}", response_model=AttachmentDocumentDetail)
async def attachment_detail(
    document_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> AttachmentDocumentDetail:
    result = await AttachmentLibraryRepository(session).get_accessible_document(
        identity, document_id
    )
    if result is None:
        raise HTTPException(status_code=404, detail="attachment_not_found")
    document, sources = result
    return AttachmentDocumentDetail(
        id=document.id,
        canonical_filename=document.canonical_filename,
        mime_type=document.mime_type,
        size_bytes=document.size_bytes,
        analysis_status=document.analysis_status,
        document_type=document.document_type,
        ai_category=document.ai_category,
        ai_subcategory=document.ai_subcategory,
        ai_confidence=document.ai_confidence,
        tags=document.tags,
        user_folder_id=document.user_folder_id,
        source_count=len(sources),
        created_at=document.created_at,
        updated_at=document.updated_at,
        sources=[AttachmentSourceOut.model_validate(source) for source in sources],
    )


@router.get("/{document_id}/download")
async def download_attachment_document(
    document_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> Response:
    result = await AttachmentLibraryRepository(session).get_accessible_document(
        identity, document_id
    )
    if result is None:
        raise HTTPException(status_code=404, detail="attachment_not_found")
    document, _sources = result
    try:
        payload = attachment_storage.read(document.storage_key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="attachment_binary_not_found") from exc
    filename = quote(document.canonical_filename, safe="")
    return Response(
        content=payload,
        media_type=document.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private,no-store",
        },
    )
