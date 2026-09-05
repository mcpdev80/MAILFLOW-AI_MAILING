"""Provider-neutral unified inbox and manual mailbox action routes."""

from __future__ import annotations

from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import RequestIdentity, require_identity
from app.database import get_session
from app.mail_client_schemas import (
    MailActionRequest,
    MailActionResult,
    MailboxCapabilities,
    MailboxFolderView,
    MessageDetail,
    ThreadView,
    UnifiedInbox,
)
from app.services.mail_actions import (
    MailActionError,
    mailbox_metadata,
    perform_mail_action,
)
from app.services.mail_client import (
    download_attachment,
    list_authorized_inbox,
    read_message,
    read_thread,
)

router = APIRouter(prefix="/mail-client", tags=["mail-client"])


@router.get("/inbox", response_model=UnifiedInbox)
async def unified_inbox(
    account_id: UUID | None = None,
    folder: str | None = Query(default=None, max_length=500),
    before_uid: int | None = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> UnifiedInbox:
    try:
        messages, counters, cursors = await list_authorized_inbox(
            session,
            identity,
            account_id=account_id,
            folder=folder,
            limit=limit,
            before_uid=before_uid,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc.args[0])) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return UnifiedInbox(
        messages=messages,
        counters=counters,
        total_unread=sum(item.unread for item in counters),
        next_before_uid_by_account=cursors,
    )


@router.get("/accounts/{account_id}/metadata")
async def account_mailbox_metadata(
    account_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, MailboxCapabilities | list[MailboxFolderView]]:
    try:
        capabilities, folders = await mailbox_metadata(
            session,
            identity,
            account_id=account_id,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"capabilities": capabilities, "folders": folders}


@router.get("/accounts/{account_id}/messages/{uid}", response_model=MessageDetail)
async def message_detail(
    account_id: UUID,
    uid: int,
    folder: str = Query(..., min_length=1, max_length=500),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> MessageDetail:
    try:
        return await read_message(
            session,
            identity,
            account_id=account_id,
            folder=folder,
            uid=uid,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc.args[0])) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/accounts/{account_id}/threads/{thread_id}", response_model=ThreadView)
async def thread_detail(
    account_id: UUID,
    thread_id: str,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> ThreadView:
    try:
        return await read_thread(
            session,
            identity,
            account_id=account_id,
            thread_id=thread_id,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post(
    "/accounts/{account_id}/messages/{uid}/actions",
    response_model=MailActionResult,
)
async def message_action(
    account_id: UUID,
    uid: int,
    payload: MailActionRequest,
    folder: str = Query(..., min_length=1, max_length=500),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> MailActionResult:
    try:
        return await perform_mail_action(
            session,
            identity,
            account_id=account_id,
            folder=folder,
            uid=uid,
            request=payload,
        )
    except MailActionError as exc:
        detail = str(exc)
        status_code = (
            422
            if detail in {"action_not_supported", "destination_folder_not_found"}
            else 502
        )
        if detail == "folder_not_found":
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/accounts/{account_id}/messages/{uid}/attachments/{part_id}")
async def attachment_download(
    account_id: UUID,
    uid: int,
    part_id: str,
    folder: str = Query(..., min_length=1, max_length=500),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> Response:
    try:
        payload, mime_type, filename = await download_attachment(
            session,
            identity,
            account_id=account_id,
            folder=folder,
            uid=uid,
            part_id=part_id,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc.args[0])) from exc
    except ValueError as exc:
        if str(exc) == "attachment_too_large":
            raise HTTPException(status_code=413, detail="attachment_too_large") from exc
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    encoded = quote(filename, safe="")
    return Response(
        content=payload,
        media_type=mime_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )
