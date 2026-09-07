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
    MoveUndoRequest,
    ThreadView,
    UnifiedInbox,
)
from app.services.mail_actions import (
    MailActionError,
    mailbox_metadata,
    perform_mail_action,
    undo_mail_move,
)
from app.services.mail_client import (
    download_attachment,
    list_authorized_inbox,
    read_message,
    read_thread,
)
from app.services.rich_mail import rich_message_html
from app.services.sender_brand import sender_brand_asset
from app.services.unified_mail import list_unified_by_role

router = APIRouter(prefix="/mail-client", tags=["mail-client"])


def _action_http_error(exc: MailActionError) -> HTTPException:
    detail = str(exc)
    status_code = (
        422
        if detail in {"action_not_supported", "destination_folder_not_found"}
        else 502
    )
    if detail in {"folder_not_found", "message_not_found"}:
        status_code = 404
    return HTTPException(status_code=status_code, detail=detail)


@router.get("/inbox", response_model=UnifiedInbox)
async def unified_inbox(
    account_id: UUID | None = None,
    folder: str | None = Query(default=None, max_length=500),
    folder_role: str | None = Query(default=None, max_length=32),
    before_uid: int | None = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> UnifiedInbox:
    try:
        if account_id is None and folder_role:
            messages, counters, cursors = await list_unified_by_role(
                session,
                identity,
                folder_role=folder_role,
                limit=limit,
            )
        else:
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


@router.get("/sender-brand")
async def sender_brand(
    address: str = Query(..., min_length=3, max_length=500),
    _identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Return a locally cached brand asset without exposing the user to remote hosts."""
    asset = await sender_brand_asset(session, address)
    if asset is None:
        return Response(status_code=204, headers={"Cache-Control": "private, max-age=3600"})
    payload, content_type, source_type = asset
    return Response(
        content=payload,
        media_type=content_type,
        headers={
            "Cache-Control": "private, max-age=86400",
            "X-Content-Type-Options": "nosniff",
            "X-MailFlow-Brand-Source": source_type,
        },
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


@router.get("/accounts/{account_id}/messages/{uid}/rich-html")
async def message_rich_html(
    account_id: UUID,
    uid: int,
    folder: str = Query(..., min_length=1, max_length=500),
    force: bool = Query(default=False),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    """Return rich HTML only after explicit one-time consent or a saved sender trust."""
    try:
        return await rich_message_html(
            session,
            identity,
            account_id=account_id,
            folder=folder,
            uid=uid,
            force=force,
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
        raise _action_http_error(exc) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post(
    "/accounts/{account_id}/moves/undo",
    response_model=MailActionResult,
)
async def undo_move(
    account_id: UUID,
    payload: MoveUndoRequest,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> MailActionResult:
    try:
        return await undo_mail_move(
            session,
            identity,
            account_id=account_id,
            request=payload,
        )
    except MailActionError as exc:
        raise _action_http_error(exc) from exc
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
