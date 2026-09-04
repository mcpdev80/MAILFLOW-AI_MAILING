"""Historical IMAP scans stay bounded and resume from persisted UID cursors."""

from __future__ import annotations

from unittest.mock import MagicMock

from mailflow_core.providers.imap_generic import ImapGenericProvider


def _provider() -> tuple[ImapGenericProvider, MagicMock]:
    provider = ImapGenericProvider(
        host="imap.example.com",
        port=993,
        username="user@example.com",
        password="secret",
    )
    client = MagicMock()
    provider._client = client
    client.folder_status.return_value = {
        b"UIDVALIDITY": 77,
        b"UIDNEXT": 2001,
        b"MESSAGES": 1200,
    }
    return provider, client


def _header(uid: int) -> bytes:
    return (
        f"Message-ID: <{uid}@example.com>\r\n"
        f"From: sender{uid}@example.com\r\n"
        "To: user@example.com\r\n"
        f"Subject: Message {uid}\r\n\r\n"
    ).encode()


def test_historical_batch_uses_bounded_uid_range_not_search_all() -> None:
    provider, client = _provider()
    client.search.return_value = list(range(1, 11))
    client.fetch.return_value = {
        uid: {b"BODY[HEADER]": _header(uid), b"BODYSTRUCTURE": ()} for uid in range(1, 11)
    }

    batch = provider.fetch_historical_batch("INBOX", max_count=10, uid_window=500)

    assert client.search.call_args.args[0] == ["UID", "1:500"]
    assert "ALL" not in client.search.call_args.args[0]
    assert [item.uid for item in batch.messages] == list(range(1, 11))
    assert batch.uidvalidity == 77
    assert batch.total_discovered == 1200
    assert batch.scan_cursor == 10
    assert batch.done is False


def test_historical_batch_resumes_after_checkpoint() -> None:
    provider, client = _provider()
    client.search.return_value = [501, 502]
    client.fetch.return_value = {
        501: {b"BODY[HEADER]": _header(501), b"BODYSTRUCTURE": ()},
        502: {b"BODY[HEADER]": _header(502), b"BODYSTRUCTURE": ()},
    }

    batch = provider.fetch_historical_batch(
        "Archive",
        after_uid=500,
        max_count=2,
        uid_window=500,
    )

    assert client.search.call_args.args[0] == ["UID", "501:1000"]
    assert [item.uid for item in batch.messages] == [501, 502]
    assert batch.scan_cursor == 502


def test_sparse_uid_space_advances_scan_cursor_without_loading_every_uid() -> None:
    provider, client = _provider()
    client.search.side_effect = [[], [777], [], []]
    client.fetch.return_value = {777: {b"BODY[HEADER]": _header(777), b"BODYSTRUCTURE": ()}}

    batch = provider.fetch_historical_batch(
        "INBOX",
        max_count=10,
        uid_window=500,
    )

    assert [call.args[0] for call in client.search.call_args_list] == [
        ["UID", "1:500"],
        ["UID", "501:1000"],
        ["UID", "1001:1500"],
        ["UID", "1501:2000"],
    ]
    assert [item.uid for item in batch.messages] == [777]
    assert batch.scan_cursor == 2000
    assert batch.done is True
