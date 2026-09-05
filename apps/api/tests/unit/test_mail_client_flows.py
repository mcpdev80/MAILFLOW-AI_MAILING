from __future__ import annotations

from dataclasses import replace
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.services import mail_client
from mailflow_core.providers.base import EmailData, MailboxFolder, MailboxMessage
from mailflow_core.types import AttachmentInfo


class _ScalarResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return self._values


class _Session:
    def __init__(self, values=None):
        self.values = values or []

    async def execute(self, _query):
        return _ScalarResult(self.values)


class _Provider:
    def __init__(self, message: MailboxMessage, full: EmailData) -> None:
        self.message = message
        self.full = full
        self.connected = False
        self.source_folder = None

    def connect(self):
        self.connected = True

    def disconnect(self):
        self.connected = False

    def list_folders(self):
        return [MailboxFolder("INBOX", "/", "inbox", True)]

    def folder_counts(self, folder):
        assert folder == "INBOX"
        return 12, 3

    def list_messages(self, folder, *, before_uid=None, limit=50):
        assert folder == "INBOX"
        return [self.message]

    def fetch_message(self, folder, uid):
        assert folder == "INBOX"
        assert uid == self.message.uid
        return self.full

    def set_source_folder(self, folder):
        self.source_folder = folder

    def fetch_attachment_content(self, uid, attachment):
        assert uid == self.message.uid
        assert attachment.part_id == "2"
        return b"pdf-data"


@pytest.fixture()
def account():
    return SimpleNamespace(
        id=uuid4(),
        username="user@example.com",
        ownership_mode="private",
        provider_type="imap",
        encrypted_oauth=None,
        encrypted_credentials=b"encrypted",
        imap_host="imap.example.com",
        imap_port=993,
        use_ssl=True,
        inbox_folder="INBOX",
        is_active=True,
    )


@pytest.fixture()
def message_pair():
    attachment = AttachmentInfo(
        part_id="2",
        filename="invoice?.pdf",
        mime_type="application/pdf",
        size=8,
        disposition="attachment",
    )
    state = MailboxMessage(
        uid=9,
        folder="INBOX",
        message_id="<m@example>",
        subject="Invoice",
        from_email="sender@example.com",
        to_emails=("user@example.com",),
        cc_emails=(),
        date="Fri, 9 May 2026 10:00:00 +0000",
        seen=False,
        flagged=True,
        answered=False,
        keywords=("MailFlow-finance",),
        attachments=(attachment,),
    )
    full = EmailData(
        uid=9,
        message_id="<m@example>",
        subject="Invoice",
        from_email="sender@example.com",
        to_emails=["user@example.com"],
        body_text="Please pay by Friday.",
        body_html="<p>Please pay by Friday.</p>",
        references=[],
        attachments=(attachment,),
    )
    return state, full


@pytest.mark.asyncio
async def test_list_authorized_inbox_maps_live_state(
    monkeypatch, account, message_pair
):
    state, full = message_pair
    provider = _Provider(state, full)

    async def build(_account):
        return provider

    async def thread_ids(_session, account_id, message_ids):
        assert account_id == account.id
        assert message_ids == ["<m@example>"]
        return {"<m@example>": "thread-1"}

    monkeypatch.setattr(mail_client, "_build_provider", build)
    monkeypatch.setattr(mail_client, "_thread_ids", thread_ids)
    monkeypatch.setattr(mail_client, "access_condition", lambda identity: True)

    messages, counters, cursors = await mail_client.list_authorized_inbox(
        _Session([account]), object(), limit=20
    )

    assert len(messages) == 1
    assert messages[0].thread_id == "thread-1"
    assert messages[0].flagged is True
    assert counters[0].total == 12
    assert counters[0].unread == 3
    assert cursors[str(account.id)] == 9
    assert provider.connected is False


@pytest.mark.asyncio
async def test_list_authorized_inbox_rejects_bad_limit():
    with pytest.raises(ValueError, match="limit must be between"):
        await mail_client.list_authorized_inbox(_Session(), object(), limit=0)


@pytest.mark.asyncio
async def test_read_message_returns_sanitized_detail(
    monkeypatch, account, message_pair
):
    state, full = message_pair
    full = replace(full, body_html="<p>safe</p><script>alert(1)</script>")
    provider = _Provider(state, full)

    async def accessible(*_args, **_kwargs):
        return account

    async def build(_account):
        return provider

    async def thread_ids(*_args, **_kwargs):
        return {"<m@example>": "thread-1"}

    monkeypatch.setattr(mail_client, "get_accessible_account", accessible)
    monkeypatch.setattr(mail_client, "_build_provider", build)
    monkeypatch.setattr(mail_client, "_thread_ids", thread_ids)

    detail = await mail_client.read_message(
        _Session(), object(), account_id=account.id, folder="INBOX", uid=9
    )

    assert detail.body_text == "Please pay by Friday."
    assert detail.safe_html == "<p>safe</p>"
    assert detail.thread_id == "thread-1"
    assert provider.connected is False


@pytest.mark.asyncio
async def test_read_message_missing_message(monkeypatch, account, message_pair):
    state, full = message_pair
    provider = _Provider(state, full)
    provider.list_messages = lambda *args, **kwargs: []

    async def accessible(*_args, **_kwargs):
        return account

    async def build(_account):
        return provider

    monkeypatch.setattr(mail_client, "get_accessible_account", accessible)
    monkeypatch.setattr(mail_client, "_build_provider", build)

    with pytest.raises(KeyError, match="message_not_found"):
        await mail_client.read_message(
            _Session(), object(), account_id=account.id, folder="INBOX", uid=9
        )


@pytest.mark.asyncio
async def test_download_attachment_is_bounded_and_sanitizes_name(
    monkeypatch, account, message_pair
):
    state, full = message_pair
    provider = _Provider(state, full)

    async def accessible(*_args, **_kwargs):
        return account

    async def build(_account):
        return provider

    monkeypatch.setattr(mail_client, "get_accessible_account", accessible)
    monkeypatch.setattr(mail_client, "_build_provider", build)

    payload, mime_type, filename = await mail_client.download_attachment(
        _Session(),
        object(),
        account_id=account.id,
        folder="INBOX",
        uid=9,
        part_id="2",
    )

    assert payload == b"pdf-data"
    assert mime_type == "application/pdf"
    assert filename == "invoice_.pdf"
    assert provider.source_folder == "INBOX"
    assert provider.connected is False


@pytest.mark.asyncio
async def test_download_attachment_missing_part(monkeypatch, account, message_pair):
    state, full = message_pair
    provider = _Provider(state, full)

    async def accessible(*_args, **_kwargs):
        return account

    async def build(_account):
        return provider

    monkeypatch.setattr(mail_client, "get_accessible_account", accessible)
    monkeypatch.setattr(mail_client, "_build_provider", build)

    with pytest.raises(KeyError, match="attachment_not_found"):
        await mail_client.download_attachment(
            _Session(),
            object(),
            account_id=account.id,
            folder="INBOX",
            uid=9,
            part_id="missing",
        )
