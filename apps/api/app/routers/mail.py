"""User-controlled outbound mail, draft and attachment endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from email.utils import make_msgid
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import RequestIdentity, require_identity
from app.database import get_session
from app.mail_schemas import AttachmentOut, DraftCreate, DraftOut, DraftUpdate, PreSendCheck, SendResult
from app.mailbox_access import access_condition, get_accessible_account
from app.models.email_account import EmailAccount
from app.models.outbound_draft import OutboundDraft, OutboundDraftAttachment
from app.services.outbound_mail import (
    MAX_ATTACHMENT_BYTES,
    MAX_TOTAL_ATTACHMENT_BYTES,
    OutboundMailError,
    pre_send_warnings,
    send_draft,
    validate_sendable,
)

router = APIRouter(prefix="/mail", tags=["mail"])


async def _get_draft(
    draft_id: UUID,
    identity: RequestIdentity,
    session: AsyncSession,
) -> OutboundDraft:
    conditions = [
        OutboundDraft.id == draft_id,
        OutboundDraft.org_id == identity.org.id,
    ]
    if identity.user_id is not None:
        conditions.append(OutboundDraft.owner_user_id == identity.user_id)
    draft = (
        await session.execute(
            select(OutboundDraft)
            .options(selectinload(OutboundDraft.attachments))
            .where(*conditions)
        )
    ).scalar_one_or_none()
    if draft is None:
        raise HTTPException(status_code=404, detail="draft_not_found")
    await get_accessible_account(draft.account_id, identity, session)
    return draft


def _editable(draft: OutboundDraft) -> None:
    if draft.status == "sent":
        raise HTTPException(status_code=409, detail="draft_already_sent")
    if draft.status == "sending":
        raise HTTPException(status_code=409, detail="send_in_progress")
    if draft.status == "discarded":
        raise HTTPException(status_code=409, detail="draft_discarded")


@router.get("/drafts", response_model=list[DraftOut])
async def list_drafts(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    include_sent: bool = False,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> list[OutboundDraft]:
    stmt = (
        select(OutboundDraft)
        .join(EmailAccount, EmailAccount.id == OutboundDraft.account_id)
        .options(selectinload(OutboundDraft.attachments))
        .where(
            OutboundDraft.org_id == identity.org.id,
            access_condition(identity),
            OutboundDraft.status != "discarded",
        )
        .order_by(OutboundDraft.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if identity.user_id is not None:
        stmt = stmt.where(OutboundDraft.owner_user_id == identity.user_id)
    if not include_sent:
        stmt = stmt.where(OutboundDraft.status != "sent")
    return list((await session.execute(stmt)).scalars().unique())


@router.post("/drafts", response_model=DraftOut, status_code=status.HTTP_201_CREATED)
async def create_draft(
    payload: DraftCreate,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> OutboundDraft:
    await get_accessible_account(payload.account_id, identity, session)
    draft = OutboundDraft(
        org_id=identity.org.id,
        account_id=payload.account_id,
        owner_user_id=identity.user_id,
        message_type=payload.message_type,
        in_reply_to=payload.in_reply_to,
        references=payload.references,
        to_recipients=payload.to_recipients,
        cc_recipients=payload.cc_recipients,
        bcc_recipients=payload.bcc_recipients,
        subject=payload.subject,
        body_text=payload.body_text,
        body_html=payload.body_html,
        editor_mode=payload.editor_mode,
    )
    session.add(draft)
    await session.commit()
    await session.refresh(draft, attribute_names=["attachments"])
    return draft


@router.get("/drafts/{draft_id}", response_model=DraftOut)
async def get_draft(
    draft_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> OutboundDraft:
    return await _get_draft(draft_id, identity, session)


@router.patch("/drafts/{draft_id}", response_model=DraftOut)
async def update_draft(
    draft_id: UUID,
    payload: DraftUpdate,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> OutboundDraft:
    draft = await _get_draft(draft_id, identity, session)
    _editable(draft)
    data = payload.model_dump(exclude_unset=True)
    account_id = data.get("account_id")
    if account_id is not None and account_id != draft.account_id:
        await get_accessible_account(account_id, identity, session)
    for field, value in data.items():
        setattr(draft, field, value)
    draft.status = "draft"
    draft.last_error = None
    await session.commit()
    await session.refresh(draft, attribute_names=["attachments"])
    return draft


@router.delete("/drafts/{draft_id}", status_code=status.HTTP_204_NO_CONTENT)
async def discard_draft(
    draft_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> None:
    draft = await _get_draft(draft_id, identity, session)
    _editable(draft)
    draft.status = "discarded"
    draft.attachments.clear()
    await session.commit()


@router.post(
    "/drafts/{draft_id}/attachments",
    response_model=AttachmentOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_attachment(
    draft_id: UUID,
    file: UploadFile = File(...),
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> OutboundDraftAttachment:
    draft = await _get_draft(draft_id, identity, session)
    _editable(draft)
    content = await file.read(MAX_ATTACHMENT_BYTES + 1)
    if len(content) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail="attachment_too_large")
    current_total = sum(item.size_bytes for item in draft.attachments)
    if current_total + len(content) > MAX_TOTAL_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail="attachments_total_too_large")
    filename = Path(file.filename or "attachment").name[:255]
    if not filename:
        filename = "attachment"
    attachment = OutboundDraftAttachment(
        draft_id=draft.id,
        filename=filename,
        content_type=(file.content_type or "application/octet-stream")[:255],
        size_bytes=len(content),
        content=content,
    )
    session.add(attachment)
    await session.commit()
    await session.refresh(attachment)
    return attachment


@router.delete(
    "/drafts/{draft_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_attachment(
    draft_id: UUID,
    attachment_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> None:
    draft = await _get_draft(draft_id, identity, session)
    _editable(draft)
    attachment = next((item for item in draft.attachments if item.id == attachment_id), None)
    if attachment is None:
        raise HTTPException(status_code=404, detail="attachment_not_found")
    await session.delete(attachment)
    await session.commit()


@router.get("/drafts/{draft_id}/pre-send", response_model=PreSendCheck)
async def check_before_send(
    draft_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> PreSendCheck:
    draft = await _get_draft(draft_id, identity, session)
    warnings = pre_send_warnings(draft)
    can_send = "missing_recipient" not in warnings and draft.status not in {"sending", "discarded"}
    return PreSendCheck(warning_codes=warnings, can_send=can_send)


@router.post("/drafts/{draft_id}/send", response_model=SendResult)
async def send_saved_draft(
    draft_id: UUID,
    identity: RequestIdentity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
) -> SendResult:
    draft = await _get_draft(draft_id, identity, session)
    if draft.status == "sent":
        return SendResult(
            draft_id=draft.id,
            status="sent",
            message_id=draft.sent_message_id,
            warning_codes=pre_send_warnings(draft),
        )
    _editable(draft)
    account = await get_accessible_account(draft.account_id, identity, session)
    try:
        validate_sendable(draft)
    except OutboundMailError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Persist a stable Message-ID and the sending fence before touching SMTP.
    # An ambiguous post-DATA disconnect is therefore never auto-retried.
    draft.sent_message_id = draft.sent_message_id or make_msgid()
    draft.status = "sending"
    draft.send_attempts += 1
    draft.last_error = None
    await session.commit()

    try:
        message_id = await send_draft(account, draft)
    except OutboundMailError as exc:
        draft.status = "failed"
        draft.last_error = str(exc)[:500]
        await session.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - never leak provider exception details
        draft.status = "failed"
        draft.last_error = f"smtp_transport_failed:{type(exc).__name__}"[:500]
        await session.commit()
        raise HTTPException(status_code=502, detail="smtp_transport_failed") from exc

    draft.status = "sent"
    draft.sent_message_id = message_id
    draft.sent_at = datetime.now(tz=UTC)
    draft.last_error = None
    await session.commit()
    return SendResult(
        draft_id=draft.id,
        status="sent",
        message_id=message_id,
        warning_codes=pre_send_warnings(draft),
    )
