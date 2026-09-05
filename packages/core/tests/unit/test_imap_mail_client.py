from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from mailflow_core.providers.imap_mail_client import ImapMailClientProvider

RAW_EMAIL = (
    b"From: sender@example.com\r\n"
    b"To: me@example.com\r\n"
    b"Cc: team@example.com\r\n"
    b"Subject: Project update\r\n"
    b"Message-ID: <message-10@example.com>\r\n"
    b"Date: Fri, 5 Sep 2026 08:00:00 +0000\r\n"
    b"Content-Type: text/plain; charset=utf-8\r\n\r\n"
    b"Hello from the project.\r\n"
)


@pytest.fixture()
def mock_imap():
    with patch("mailflow_core.providers.imap_generic.imapclient.IMAPClient") as mock_cls:
        instance = MagicMock()
        mock_cls.return_value = instance
        instance.list_folders.return_value = [
            ([], b"/", "INBOX"),
            ([b"\\Archive"], b"/", "Archive"),
            ([b"\\Trash"], b"/", "Trash"),
            ([b"\\Junk"], b"/", "Spam"),
            ([b"\\Drafts"], b"/", "Drafts"),
        ]
        instance.folder_status.return_value = {
            b"UIDVALIDITY": 123,
            b"UIDNEXT": 20,
            b"MESSAGES": 10,
        }
        yield instance


@pytest.fixture()
def provider(mock_imap):
    value = ImapMailClientProvider("imap.example.com", 993, "me@example.com", "secret")
    value.connect()
    return value


def test_folder_roles_and_capabilities(provider):
    folders = provider.list_folders()
    roles = {item.name: item.role for item in folders}
    assert roles["INBOX"] == "inbox"
    assert roles["Archive"] == "archive"
    assert roles["Trash"] == "trash"
    assert roles["Spam"] == "spam"
    capabilities = provider.capabilities()
    assert capabilities.read_state is True
    assert capabilities.archive is True
    assert capabilities.trash is True
    assert capabilities.spam is True
    assert capabilities.tags is True


def test_list_messages_returns_flags_and_keywords(provider, mock_imap):
    mock_imap.search.return_value = [8, 9, 10]
    mock_imap.fetch.return_value = {
        10: {
            b"RFC822": RAW_EMAIL,
            b"FLAGS": [b"\\Seen", b"\\Flagged", b"MailFlow-Today"],
        },
        9: {b"RFC822": RAW_EMAIL, b"FLAGS": []},
    }

    messages = provider.list_messages("INBOX", limit=2)

    assert [item.uid for item in messages] == [10, 9]
    assert messages[0].seen is True
    assert messages[0].flagged is True
    assert messages[0].keywords == ("MailFlow-Today",)
    assert messages[0].cc_emails == ("team@example.com",)


def test_before_uid_one_returns_empty_without_search(provider, mock_imap):
    mock_imap.search.reset_mock()
    assert provider.list_messages("INBOX", before_uid=1) == []
    mock_imap.search.assert_not_called()


def test_seen_and_flag_updates_are_idempotent_store_operations(provider, mock_imap):
    provider.set_seen("INBOX", 10, True)
    mock_imap.add_flags.assert_called_with([10], [r"\Seen"])
    provider.set_seen("INBOX", 10, False)
    mock_imap.remove_flags.assert_called_with([10], [r"\Seen"])

    provider.set_flagged("INBOX", 10, True)
    mock_imap.add_flags.assert_called_with([10], [r"\Flagged"])
    provider.set_flagged("INBOX", 10, False)
    mock_imap.remove_flags.assert_called_with([10], [r"\Flagged"])


def test_folder_counts_are_authoritative(provider, mock_imap):
    mock_imap.search.side_effect = [[1, 2, 3], [2, 3]]
    assert provider.folder_counts("INBOX") == (3, 2)


def test_find_message_uses_stable_message_id_across_folders(provider, mock_imap):
    def search(criteria):
        if criteria == ["HEADER", "Message-ID", "<moved@example.com>"]:
            selected = mock_imap.select_folder.call_args[0][0]
            return [77] if selected == "Archive" else []
        return []

    mock_imap.search.side_effect = search
    location = provider.find_message("<moved@example.com>", ["INBOX", "Archive"])
    assert location == ("Archive", 77)


def test_archive_trash_and_spam_use_special_use_folders(provider, mock_imap):
    assert provider.archive_email("INBOX", 10) is True
    mock_imap.copy.assert_called_with([10], "Archive")

    assert provider.trash_email("INBOX", 11) is True
    mock_imap.copy.assert_called_with([11], "Trash")

    assert provider.mark_spam("INBOX", 12) is True
    mock_imap.copy.assert_called_with([12], "Spam")


def test_tag_names_are_normalized_and_removable(provider, mock_imap):
    provider.set_source_folder("INBOX")
    provider.apply_tags(10, ["Needs review", "Needs review"])
    mock_imap.add_flags.assert_called_with([10], ["MailFlow-Needs-review"])

    provider.remove_tags("INBOX", 10, ["Needs review"])
    mock_imap.remove_flags.assert_called_with([10], ["MailFlow-Needs-review"])
