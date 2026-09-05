from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.mail_client_schemas import MoveUndoRequest
from app.services import mail_actions


class _FakeProvider:
    def __init__(self) -> None:
        self.connected = False
        self.disconnected = False
        self.lookup: tuple[str, tuple[str, ...]] | None = None
        self.move: tuple[str, int, str] | None = None

    def connect(self) -> None:
        self.connected = True

    def disconnect(self) -> None:
        self.disconnected = True

    def list_folders(self) -> list[SimpleNamespace]:
        return [
            SimpleNamespace(name="INBOX", selectable=True),
            SimpleNamespace(name="Archive", selectable=True),
        ]

    def capabilities(self) -> SimpleNamespace:
        return SimpleNamespace(move=True, restore=True)

    def find_message(
        self, message_id: str, *, folders: list[str]
    ) -> tuple[str, int] | None:
        self.lookup = (message_id, tuple(folders))
        return ("Archive", 456)

    def move_from_folder(self, folder: str, uid: int, destination: str) -> bool:
        self.move = (folder, uid, destination)
        return True


@pytest.mark.asyncio
async def test_undo_mail_move_resolves_current_uid_from_message_id(monkeypatch) -> None:
    provider = _FakeProvider()

    async def fake_get_accessible_account(*args, **kwargs):
        return object()

    async def fake_build_provider(account):
        return provider

    monkeypatch.setattr(
        mail_actions, "get_accessible_account", fake_get_accessible_account
    )
    monkeypatch.setattr(mail_actions, "_build_provider", fake_build_provider)

    result = await mail_actions.undo_mail_move(
        None,
        object(),
        account_id=uuid4(),
        request=MoveUndoRequest(
            message_id="<stable@example.test>",
            current_folder="Archive",
            original_folder="INBOX",
        ),
    )

    assert provider.connected is True
    assert provider.disconnected is True
    assert provider.lookup == ("<stable@example.test>", ("Archive",))
    assert provider.move == ("Archive", 456, "INBOX")
    assert result.action == "restore"
    assert result.applied is True
    assert result.destination_folder == "INBOX"
