"""Global, permission-aware attachment library endpoints."""

from __future__ import annotations

from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.attachment_library_schemas import (
    AttachmentCorrection,
    AttachmentDocumentDetail,
    AttachmentDocumentListItem,
    AttachmentFolderCreate,
    AttachmentFolderOut,
    AttachmentFolderUpdate,
    AttachmentSourceOut,
    BlockedAttachmentOut,
)
from app.attachment_storage import attachment_storage
from app.auth import RequestIdentity, require_identity
from app.database import get_session
from app.models.attachment_library import AttachmentDocument, AttachmentPlacement
from app.repositories.attachment_library import AttachmentLibraryRepository

router = APIRouter(prefix="/attachments", tags=["attachments"])


def _item(
    document: AttachmentDocument,
    placement: AttachmentPlacement | None,
    source_count: int,
    *,
    display_filename: str | None = None,
) -> AttachmentDocumentListItem:
    return AttachmentDocumentListItem(
        id=document.id,
        canonical_filename=display_filename or document.canonical_filename,
        mime_type=document.mime_type,
        size_bytes=document.size_bytes,
        analysis_status=document.analysis_status,
        document_type=document.document_type,
        ai_category=document.ai_category,
        ai_subcategory=document.ai_subcategory,
        ai_confidence=document.ai_confidence,
        category=(placement.category_override if placement else None) or document.ai_category,
        subcategory=(placement.subcategory_override if placement else None)
        or document.ai_subcategory,
        tags=list(dict.fromkeys([*document.ai_tags, *(placement.user_tags if placement else [])])),
        folder_id=placement.folder_id if placement else None,
        source_count=source_count,
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


@router.get("", response_model=list[AttachmentDocumentListItem])
async def list_attachments(
    q: str | None = None,
    account_id: UUID | None = None,
    folder_id: UUID | None = None,
    category: str | None = None,
    document_type: str | None = None,
    mime_type: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[AttachmentDocumentListItem]:
    repo = AttachmentLibraryRepository(session)
    rows = await repo.list_accessible_documents(
        identity,
        query=q,
        account_id=account_id,
        folder_id=folder_id,
        category=category,
        document_type=document_type,
        mime_type=mime_type,
        limit=limit,
        offset=offset,
    )
    items: list[AttachmentDocumentListItem] = []
    for document, placement, source_count in rows:
        detail = await repo.get_accessible_document(identity, document.id)
        filename = detail[2][0].source_filename if detail and detail[2] else None
        items.append(
            _item(
                document,
                placement,
                source_count,
                display_filename=filename,
            )
        )
    return items


@router.get("/folders", response_model=list[AttachmentFolderOut])
async def list_attachment_folders(
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[object]:
    return list(await AttachmentLibraryRepository(session).list_folders(identity))


@router.post(
    "/folders",
    response_model=AttachmentFolderOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_attachment_folder(
    payload: AttachmentFolderCreate,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> object:
    repo = AttachmentLibraryRepository(session)
    if payload.parent_id is not None and await repo.get_folder(identity, payload.parent_id) is None:
        raise HTTPException(status_code=404, detail="attachment_parent_folder_not_found")
    folder = await repo.create_folder(
        identity,
        name=payload.name.strip(),
        parent_id=payload.parent_id,
        managed_by="user",
    )
    await session.commit()
    await session.refresh(folder)
    return folder


@router.patch("/folders/{folder_id}", response_model=AttachmentFolderOut)
async def update_attachment_folder(
    folder_id: UUID,
    payload: AttachmentFolderUpdate,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> object:
    repo = AttachmentLibraryRepository(session)
    folder = await repo.get_folder(identity, folder_id)
    if folder is None:
        raise HTTPException(status_code=404, detail="attachment_folder_not_found")
    if payload.parent_id == folder_id:
        raise HTTPException(status_code=422, detail="attachment_folder_self_parent")
    if payload.parent_id is not None and await repo.get_folder(identity, payload.parent_id) is None:
        raise HTTPException(status_code=404, detail="attachment_parent_folder_not_found")
    if payload.name is not None:
        folder.name = payload.name.strip()
        folder.managed_by = "user"
    if "parent_id" in payload.model_fields_set:
        folder.parent_id = payload.parent_id
    if payload.pinned is not None:
        folder.pinned = payload.pinned
    await session.commit()
    await session.refresh(folder)
    return folder


@router.delete("/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment_folder(
    folder_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> None:
    repo = AttachmentLibraryRepository(session)
    folder = await repo.get_folder(identity, folder_id)
    if folder is None:
        raise HTTPException(status_code=404, detail="attachment_folder_not_found")
    await session.delete(folder)
    await session.commit()


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
    document, placement, sources = result
    filename = sources[0].source_filename if sources else None
    item = _item(document, placement, len(sources), display_filename=filename)
    return AttachmentDocumentDetail(
        **item.model_dump(),
        extracted_text=document.extracted_text,
        sources=[AttachmentSourceOut.model_validate(source) for source in sources],
    )


@router.patch("/{document_id}", response_model=AttachmentDocumentDetail)
async def correct_attachment_organization(
    document_id: UUID,
    payload: AttachmentCorrection,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> AttachmentDocumentDetail:
    repo = AttachmentLibraryRepository(session)
    result = await repo.get_accessible_document(identity, document_id)
    if result is None:
        raise HTTPException(status_code=404, detail="attachment_not_found")
    document, _placement, sources = result
    if payload.folder_id is not None and await repo.get_folder(identity, payload.folder_id) is None:
        raise HTTPException(status_code=404, detail="attachment_folder_not_found")

    tags = list(dict.fromkeys(tag.strip() for tag in payload.tags if tag.strip()))
    placement = await repo.upsert_placement(
        identity,
        document_id,
        folder_id=payload.folder_id,
        category_override=payload.category.strip() if payload.category else None,
        subcategory_override=payload.subcategory.strip() if payload.subcategory else None,
        user_tags=tags,
        corrected=True,
    )

    if payload.remember:
        if payload.folder_id is None:
            raise HTTPException(status_code=422, detail="remember_requires_folder")
        source = sources[0]
        sender = source.from_email.strip().lower()
        sender_domain = sender.rsplit("@", 1)[1] if "@" in sender else None
        await repo.remember_organization(
            identity,
            folder_id=payload.folder_id,
            sender_email=None,
            sender_domain=sender_domain,
            filename_pattern=None,
            mime_type=document.mime_type,
            document_type=document.document_type,
        )

    await session.commit()
    await session.refresh(placement)
    filename = sources[0].source_filename if sources else None
    item = _item(document, placement, len(sources), display_filename=filename)
    return AttachmentDocumentDetail(
        **item.model_dump(),
        extracted_text=document.extracted_text,
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
    document, _placement, sources = result
    try:
        payload = attachment_storage.read(document.storage_key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="attachment_binary_not_found") from exc
    display_name = sources[0].source_filename if sources else document.canonical_filename
    filename = quote(display_name, safe="")
    return Response(
        content=payload,
        media_type=document.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private,no-store",
        },
    )
