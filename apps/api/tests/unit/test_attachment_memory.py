from __future__ import annotations

from uuid import uuid4

import pytest

from app.models.attachment_library import (
    AttachmentDocument,
    AttachmentFolder,
    AttachmentMemory,
    AttachmentPlacement,
)
from app.models.email_account import EmailAccount
from app.models.mailbox_access import MailboxAccess
from app.models.organization import Organization
from app.services.attachment_library import _apply_attachment_memory
from sqlalchemy import select


@pytest.mark.asyncio
async def test_shared_mailbox_memory_is_applied_per_authorized_user(session):
    org = Organization(name="Attachment memory shared", slug=f"att-mem-{uuid4()}")
    session.add(org)
    await session.flush()

    account = EmailAccount(
        org_id=org.id,
        owner_user_id=None,
        ownership_mode="shared",
        imap_host="imap.example.test",
        username="team@example.test",
    )
    session.add(account)
    await session.flush()
    session.add_all(
        [
            MailboxAccess(account_id=account.id, user_id="user-a", can_use=True),
            MailboxAccess(account_id=account.id, user_id="user-b", can_use=True),
        ]
    )

    document = AttachmentDocument(
        org_id=org.id,
        content_sha256=uuid4().hex + uuid4().hex,
        storage_key=f"test/{uuid4().hex}",
        canonical_filename="invoice.pdf",
        mime_type="application/pdf",
        size_bytes=1234,
        analysis_status="ready",
        document_type="invoice",
        ai_category="finance",
        ai_confidence=0.9,
        ai_tags=["invoice"],
    )
    session.add(document)
    await session.flush()

    folder_a = AttachmentFolder(
        org_id=org.id,
        owner_scope="user-a",
        name="A invoices",
        managed_by="user",
    )
    folder_b = AttachmentFolder(
        org_id=org.id,
        owner_scope="user-b",
        name="B finance",
        managed_by="user",
    )
    session.add_all([folder_a, folder_b])
    await session.flush()
    session.add_all(
        [
            AttachmentMemory(
                org_id=org.id,
                owner_scope="user-a",
                folder_id=folder_a.id,
                sender_domain="vendor.example",
                mime_type="application/pdf",
                document_type="invoice",
            ),
            AttachmentMemory(
                org_id=org.id,
                owner_scope="user-b",
                folder_id=folder_b.id,
                sender_domain="vendor.example",
                mime_type="application/pdf",
                document_type="invoice",
            ),
        ]
    )
    await session.flush()

    await _apply_attachment_memory(
        session,
        account=account,
        document_id=document.id,
        sender_email="billing@vendor.example",
        filename="invoice.pdf",
        mime_type="application/pdf",
        document_type="invoice",
    )
    await session.flush()

    placements = list(
        (
            await session.execute(
                select(AttachmentPlacement).where(
                    AttachmentPlacement.document_id == document.id
                )
            )
        ).scalars()
    )
    by_owner = {placement.owner_scope: placement.folder_id for placement in placements}
    assert by_owner == {
        "user-a": folder_a.id,
        "user-b": folder_b.id,
    }


@pytest.mark.asyncio
async def test_attachment_memory_never_overwrites_corrected_placement(session):
    org = Organization(name="Attachment memory correction", slug=f"att-corr-{uuid4()}")
    session.add(org)
    await session.flush()
    account = EmailAccount(
        org_id=org.id,
        owner_user_id="user-a",
        ownership_mode="private",
        imap_host="imap.example.test",
        username="a@example.test",
    )
    session.add(account)
    await session.flush()

    document = AttachmentDocument(
        org_id=org.id,
        content_sha256=uuid4().hex + uuid4().hex,
        storage_key=f"test/{uuid4().hex}",
        canonical_filename="invoice.pdf",
        mime_type="application/pdf",
        size_bytes=1234,
        analysis_status="ready",
        document_type="invoice",
        ai_category="finance",
        ai_confidence=0.9,
        ai_tags=["invoice"],
    )
    session.add(document)
    manual = AttachmentFolder(org_id=org.id, owner_scope="user-a", name="Manual", managed_by="user")
    learned = AttachmentFolder(org_id=org.id, owner_scope="user-a", name="Learned", managed_by="user")
    session.add_all([manual, learned])
    await session.flush()
    session.add(
        AttachmentPlacement(
            document_id=document.id,
            org_id=org.id,
            owner_scope="user-a",
            folder_id=manual.id,
            corrected=True,
            user_tags=[],
        )
    )
    session.add(
        AttachmentMemory(
            org_id=org.id,
            owner_scope="user-a",
            folder_id=learned.id,
            sender_domain="vendor.example",
            document_type="invoice",
        )
    )
    await session.flush()

    await _apply_attachment_memory(
        session,
        account=account,
        document_id=document.id,
        sender_email="billing@vendor.example",
        filename="invoice.pdf",
        mime_type="application/pdf",
        document_type="invoice",
    )
    await session.flush()

    placement = (
        await session.execute(
            select(AttachmentPlacement).where(
                AttachmentPlacement.document_id == document.id,
                AttachmentPlacement.owner_scope == "user-a",
            )
        )
    ).scalar_one()
    assert placement.folder_id == manual.id
    assert placement.corrected is True
