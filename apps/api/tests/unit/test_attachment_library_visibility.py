from __future__ import annotations

from uuid import uuid4

import pytest

from app.auth import RequestIdentity
from app.models.attachment_library import AttachmentDocument, AttachmentSource
from app.models.email_account import EmailAccount
from app.models.mailbox_access import MailboxAccess
from app.models.organization import Organization
from app.repositories.attachment_library import AttachmentLibraryRepository


def _identity(org: Organization, user_id: str) -> RequestIdentity:
    return RequestIdentity(
        org=org,
        user_id=user_id,
        auth_org_id="auth-org",
        role="member",
    )


async def _account(session, org: Organization, user_id: str) -> EmailAccount:
    account = EmailAccount(
        org_id=org.id,
        owner_user_id=user_id,
        ownership_mode="private",
        imap_host="imap.example.test",
        username=f"{user_id}@example.test",
    )
    session.add(account)
    await session.flush()
    return account


async def _document(session, org: Organization, name: str) -> AttachmentDocument:
    document = AttachmentDocument(
        org_id=org.id,
        content_sha256=uuid4().hex + uuid4().hex,
        storage_key=f"test/{uuid4().hex}",
        canonical_filename=name,
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
    return document


async def _source(
    session,
    *,
    account: EmailAccount,
    document: AttachmentDocument,
    uid: int,
    source_filename: str | None = None,
) -> AttachmentSource:
    source = AttachmentSource(
        document_id=document.id,
        account_id=account.id,
        uid=uid,
        folder="INBOX",
        part_id="2",
        message_id=f"<{uid}@example.test>",
        thread_id=f"thread-{uid}",
        from_email="billing@example.test",
        subject="Invoice",
        source_filename=source_filename or document.canonical_filename,
        mime_type=document.mime_type,
        size_bytes=document.size_bytes,
        disposition="attachment",
        ingestion_status="stored",
    )
    session.add(source)
    await session.flush()
    return source


@pytest.mark.asyncio
async def test_private_attachment_is_invisible_to_other_org_user(session):
    org = Organization(name="Attachment visibility", slug=f"att-vis-{uuid4()}")
    session.add(org)
    await session.flush()
    account_a = await _account(session, org, "user-a")
    await _account(session, org, "user-b")
    document = await _document(session, org, "a-invoice.pdf")
    await _source(session, account=account_a, document=document, uid=1)
    await session.commit()

    repo = AttachmentLibraryRepository(session)
    rows_a = await repo.list_accessible_documents(_identity(org, "user-a"))
    rows_b = await repo.list_accessible_documents(_identity(org, "user-b"))

    assert [row[0].id for row in rows_a] == [document.id]
    assert rows_b == []
    assert await repo.get_accessible_document(_identity(org, "user-b"), document.id) is None


@pytest.mark.asyncio
async def test_deduplicated_document_exposes_only_callers_authorized_sources(session):
    org = Organization(name="Attachment dedup visibility", slug=f"att-dedup-{uuid4()}")
    session.add(org)
    await session.flush()
    account_a = await _account(session, org, "user-a")
    account_b = await _account(session, org, "user-b")
    document = await _document(session, org, "internal-origin-name.pdf")
    source_a = await _source(
        session,
        account=account_a,
        document=document,
        uid=10,
        source_filename="alice-private-name.pdf",
    )
    source_b = await _source(
        session,
        account=account_b,
        document=document,
        uid=11,
        source_filename="bob-visible-name.pdf",
    )
    await session.commit()

    repo = AttachmentLibraryRepository(session)
    detail_a = await repo.get_accessible_document(_identity(org, "user-a"), document.id)
    detail_b = await repo.get_accessible_document(_identity(org, "user-b"), document.id)

    assert detail_a is not None
    assert detail_b is not None
    assert [source.id for source in detail_a[2]] == [source_a.id]
    assert [source.id for source in detail_b[2]] == [source_b.id]
    assert [source.source_filename for source in detail_a[2]] == ["alice-private-name.pdf"]
    assert [source.source_filename for source in detail_b[2]] == ["bob-visible-name.pdf"]

    rows_a = await repo.list_accessible_documents(_identity(org, "user-a"))
    rows_b = await repo.list_accessible_documents(_identity(org, "user-b"))
    assert rows_a[0][2] == 1
    assert rows_b[0][2] == 1


@pytest.mark.asyncio
async def test_shared_attachment_requires_explicit_can_use_grant(session):
    org = Organization(name="Attachment shared visibility", slug=f"att-shared-{uuid4()}")
    session.add(org)
    await session.flush()
    shared = EmailAccount(
        org_id=org.id,
        owner_user_id=None,
        ownership_mode="shared",
        imap_host="imap.example.test",
        username="team@example.test",
    )
    session.add(shared)
    await session.flush()
    session.add(
        MailboxAccess(
            account_id=shared.id,
            user_id="user-a",
            can_use=True,
            can_manage=False,
        )
    )
    document = await _document(session, org, "team-contract.pdf")
    await _source(session, account=shared, document=document, uid=20)
    await session.commit()

    repo = AttachmentLibraryRepository(session)
    rows_a = await repo.list_accessible_documents(_identity(org, "user-a"))
    rows_b = await repo.list_accessible_documents(_identity(org, "user-b"))

    assert [row[0].id for row in rows_a] == [document.id]
    assert rows_b == []
