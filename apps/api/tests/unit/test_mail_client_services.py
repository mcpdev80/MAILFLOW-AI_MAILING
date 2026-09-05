from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.mail_client_schemas import MailActionRequest
from app.services import mail_actions, mail_client
from mailflow_core.providers.base import (
    EmailData,
    MailboxFolder,
    MailboxMessage,
    ProviderCapabilities,
)
from mailflow_core.types import AttachmentInfo


class FakeProvider:
    def __init__(self, *, capabilities: ProviderCapabilities | None = None) -> None:
        self._capabilities = capabilities or ProviderCapabilities(
            read_state=True,
            flag=True,
            move=True,
            archive=True,
            trash=True,
            spam=True,
            restore=True,
            tags=True,
            attachments=True,
        )
        self.connected = False
        self.calls: list[tuple] = []
        self.folders = [
            MailboxFolder("INBOX", "/", "inbox", True),
            MailboxFolder("Archive", "/", "archive", True),
            MailboxFolder("Trash", "/", "trash", True),
            MailboxFolder("Junk", "/", "spam", True),
        ]

    def connect(self) -> None:
        self.connected = True
        self.calls.append(("connect",))

    def disconnect(self) -> None:
        self.connected = False
        self.calls.append(("disconnect",))

    def capabilities(self) -> ProviderCapabilities:
        return self._capabilities

    def list_folders(self) -> list[MailboxFolder]:
        return self.folders

    def set_seen(self, folder: str, uid: int, value: bool) -> None:
        self.calls.append(("seen", folder, uid, value))

    def set_flagged(self, folder: str, uid: int, value: bool) -> None:
        self.calls.append(("flagged", folder, uid, value))

    def move_from_folder(self, folder: str, uid: int, destination: str) -> bool:
        self.calls.append(("move", folder, uid, destination))
        return True

    def archive_email(self, folder: str, uid: int) -> bool:
        self.calls.append(("archive", folder, uid))
        return True

    def trash_email(self, folder: str, uid: int) -> bool:
        self.calls.append(("trash", folder, uid))
        return True

    def mark_spam(self, folder: str, uid: int) -> bool:
        self.calls.append(("spam", folder, uid))
        return True

    def set_source_folder(self, folder: str) -> None:
        self.calls.append(("source", folder))

    def apply_tags(self, uid: int, tags: list[str]) -> None:
        self.calls.append(("add_tags", uid, tuple(tags)))

    def remove_tags(self, folder: str, uid: int, tags: list[str]) -> None:
        self.calls.append(("remove_tags", folder, uid, tuple(tags)))


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
    )


@pytest.mark.asyncio
async def test_mailbox_metadata(monkeypatch, account):
    provider = FakeProvider()

    async def accessible(*args, **kwargs):
        return account

    async def build(_account):
        return provider

    monkeypatch.setattr(mail_actions, "get_accessible_account", accessible)
    monkeypatch.setattr(mail_actions, "_build_provider", build)

    capabilities, folders = await mail_actions.mailbox_metadata(
        object(), object(), account_id=account.id
    )

    assert capabilities.archive is True
    assert [item.role for item in folders] == ["inbox", "archive", "trash", "spam"]
    assert provider.connected is False


@pytest.mark.parametrize(
    ("action", "expected_call"),
    [
        (MailActionRequest(action="mark_read"), ("seen", "INBOX", 7, True)),
        (MailActionRequest(action="mark_unread"), ("seen", "INBOX", 7, False)),
        (MailActionRequest(action="flag"), ("flagged", "INBOX", 7, True)),
        (MailActionRequest(action="unflag"), ("flagged", "INBOX", 7, False)),
        (
            MailActionRequest(action="move", destination_folder="Archive"),
            ("move", "INBOX", 7, "Archive"),
        ),
        (
            MailActionRequest(action="restore", destination_folder="Archive"),
            ("move", "INBOX", 7, "Archive"),
        ),
        (MailActionRequest(action="archive"), ("archive", "INBOX", 7)),
        (MailActionRequest(action="trash"), ("trash", "INBOX", 7)),
        (MailActionRequest(action="spam"), ("spam", "INBOX", 7)),
        (
            MailActionRequest(action="add_tags", tags=["work"]),
            ("add_tags", 7, ("work",)),
        ),
        (
            MailActionRequest(action="remove_tags", tags=["work"]),
            ("remove_tags", "INBOX", 7, ("work",)),
        ),
    ],
)
@pytest.mark.asyncio
async def test_perform_mail_action_success(monkeypatch, account, action, expected_call):
    provider = FakeProvider()

    async def accessible(*args, **kwargs):
        return account

    async def build(_account):
        return provider

    monkeypatch.setattr(mail_actions, "get_accessible_account", accessible)
    monkeypatch.setattr(mail_actions, "_build_provider", build)

    result = await mail_actions.perform_mail_action(
        object(), object(), account_id=account.id, folder="INBOX", uid=7, request=action
    )

    assert result.applied is True
    assert expected_call in provider.calls
    assert provider.connected is False


@pytest.mark.asyncio
async def test_perform_mail_action_rejects_unknown_folder(monkeypatch, account):
    provider = FakeProvider()

    async def accessible(*args, **kwargs):
        return account

    async def build(_account):
        return provider

    monkeypatch.setattr(mail_actions, "get_accessible_account", accessible)
    monkeypatch.setattr(mail_actions, "_build_provider", build)

    with pytest.raises(mail_actions.MailActionError, match="folder_not_found"):
        await mail_actions.perform_mail_action(
            object(),
            object(),
            account_id=account.id,
            folder="Missing",
            uid=7,
            request=MailActionRequest(action="mark_read"),
        )


@pytest.mark.asyncio
async def test_perform_mail_action_rejects_unsupported(monkeypatch, account):
    provider = FakeProvider(capabilities=ProviderCapabilities())

    async def accessible(*args, **kwargs):
        return account

    async def build(_account):
        return provider

    monkeypatch.setattr(mail_actions, "get_accessible_account", accessible)
    monkeypatch.setattr(mail_actions, "_build_provider", build)

    with pytest.raises(mail_actions.MailActionError, match="action_not_supported"):
        await mail_actions.perform_mail_action(
            object(),
            object(),
            account_id=account.id,
            folder="INBOX",
            uid=7,
            request=MailActionRequest(action="archive"),
        )


def test_sanitize_message_html_removes_active_remote_content():
    raw = (
        '<div style="color:red">Hello<script>alert(1)</script>'
        '<img src="https://tracker.example/pixel">'
        '<a href="javascript:alert(1)" onclick="bad()">bad</a>'
        '<a href="https://example.com" style="x">safe</a></div>'
    )
    safe = mail_client.sanitize_message_html(raw)
    assert "script" not in safe
    assert "img" not in safe
    assert "javascript" not in safe
    assert "onclick" not in safe
    assert "style=" not in safe
    assert 'href="https://example.com"' in safe
    assert 'rel="noopener noreferrer"' in safe


def test_date_key_handles_valid_invalid_and_empty():
    assert mail_client._date_key(None) == 0.0
    assert mail_client._date_key("not-a-date") == 0.0
    assert mail_client._date_key("Fri, 9 May 2026 10:00:00 +0000") > 0


def test_message_mapping_helpers(account):
    attachment = AttachmentInfo(
        "2", "invoice.pdf", "application/pdf", 1234, "attachment"
    )
    state = MailboxMessage(
        uid=9,
        folder="INBOX",
        message_id="<m@example>",
        subject="Subject",
        from_email="sender@example.com",
        to_emails=("user@example.com",),
        cc_emails=("cc@example.com",),
        date="Fri, 9 May 2026 10:00:00 +0000",
        seen=True,
        flagged=True,
        answered=False,
        keywords=("MailFlow-work",),
        attachments=(attachment,),
    )
    message = EmailData(
        uid=9,
        message_id="<m@example>",
        subject="Subject",
        from_email="sender@example.com",
        to_emails=["user@example.com"],
        body_text="plain",
        body_html='<p style="x">html</p>',
        in_reply_to="<parent@example>",
        references=["<root@example>"],
        attachments=(attachment,),
    )

    inbox = mail_client._inbox_message(account, state, thread_id="thread-1")
    detail = mail_client._message_detail(account, state, message, thread_id="thread-1")

    assert inbox.thread_id == "thread-1"
    assert inbox.attachments[0].filename == "invoice.pdf"
    assert detail.body_text == "plain"
    assert detail.safe_html == "<p>html</p>"
    assert detail.in_reply_to == "<parent@example>"


@pytest.mark.asyncio
async def test_build_provider_password_credentials(monkeypatch, account):
    monkeypatch.setattr(
        mail_client, "decrypt_secret", lambda value: {"password": "secret"}
    )
    provider = await mail_client._build_provider(account)
    assert provider._host == "imap.example.com"
    assert provider._password == "secret"
    assert provider._access_token is None


@pytest.mark.asyncio
async def test_build_provider_oauth(monkeypatch, account):
    account.provider_type = "gmail"
    account.encrypted_oauth = b"oauth"
    account.encrypted_credentials = None
    monkeypatch.setattr(
        mail_client, "decrypt_secret", lambda value: {"refresh_token": "refresh"}
    )
    monkeypatch.setattr(
        mail_client.oauth,
        "access_token_from_refresh",
        lambda provider, token: "access-token",
    )
    provider = await mail_client._build_provider(account)
    assert provider._access_token == "access-token"
    assert provider._password is None


@pytest.mark.asyncio
async def test_build_provider_requires_credentials(account):
    account.encrypted_credentials = None
    with pytest.raises(RuntimeError, match="mailbox_credentials_unavailable"):
        await mail_client._build_provider(account)
