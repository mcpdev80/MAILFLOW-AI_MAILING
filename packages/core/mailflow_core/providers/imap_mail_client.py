"""Normal mail-client operations layered on the generic IMAP provider."""

from __future__ import annotations

import email
from dataclasses import replace

from mailflow_core.providers.base import (
    EmailData,
    MailboxFolder,
    MailboxMessage,
    ProviderCapabilities,
)
from mailflow_core.providers.imap_generic import (
    ImapGenericProvider,
    _attachment_metadata,
    _first_fetch_bytes,
)

_SYSTEM_FLAGS = frozenset(
    {"\\seen", "\\answered", "\\flagged", "\\deleted", "\\draft", "\\recent"}
)
_ROLE_FLAGS = {
    "\\inbox": "inbox",
    "\\sent": "sent",
    "\\drafts": "drafts",
    "\\trash": "trash",
    "\\junk": "spam",
    "\\spam": "spam",
    "\\archive": "archive",
    "\\all": "all",
}


def _flag_text(value: object) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value)


def _safe_keyword(tag: str) -> str:
    return "MailFlow-" + "".join(
        ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in str(tag)
    )[:80]


class ImapMailClientProvider(ImapGenericProvider):
    """IMAP implementation of provider-neutral day-to-day mailbox operations."""

    def capabilities(self) -> ProviderCapabilities:
        roles = {folder.role for folder in self.list_folders()}
        return ProviderCapabilities(
            read_state=True,
            flag=True,
            move=True,
            archive="archive" in roles,
            trash="trash" in roles,
            spam="spam" in roles,
            restore=True,
            tags=True,
            attachments=True,
        )

    def list_folders(self) -> list[MailboxFolder]:
        result: list[MailboxFolder] = []
        for raw_flags, delimiter, name in self._client.list_folders():
            flags = {_flag_text(flag).lower() for flag in raw_flags}
            folder_name = _flag_text(name)
            role = next((_ROLE_FLAGS[flag] for flag in flags if flag in _ROLE_FLAGS), None)
            if folder_name.upper() == "INBOX":
                role = "inbox"
            result.append(
                MailboxFolder(
                    name=folder_name,
                    delimiter=_flag_text(delimiter or self._separator),
                    role=role,
                    selectable="\\noselect" not in flags,
                )
            )
        return result

    def folder_counts(self, folder: str) -> tuple[int, int]:
        """Return authoritative total/unseen counts for one selectable folder."""
        self._client.select_folder(folder, readonly=True)
        total = len(self._client.search(["ALL"]))
        unseen = len(self._client.search(["UNSEEN"]))
        return total, unseen

    def _special_folder(self, role: str) -> str | None:
        for folder in self.list_folders():
            if folder.role == role and folder.selectable:
                return folder.name
        return None

    def _mailbox_message_from_fetch(self, folder: str, uid: int, data: dict) -> MailboxMessage:
        msg = email.message_from_bytes(_first_fetch_bytes(data))
        raw_flags = data.get(b"FLAGS", ())
        flags = {_flag_text(flag) for flag in raw_flags}
        lowered = {flag.lower() for flag in flags}
        refs = tuple(part for part in (msg.get("References", "") or "").split() if part)
        attachments = _attachment_metadata(data.get(b"BODYSTRUCTURE"))
        self._attachment_metadata_cache[uid] = attachments
        keywords = tuple(
            sorted(flag for flag in flags if flag.lower() not in _SYSTEM_FLAGS)
        )
        return MailboxMessage(
            uid=uid,
            folder=folder,
            message_id=msg.get("Message-ID", ""),
            subject=msg.get("Subject", ""),
            from_email=msg.get("From", ""),
            to_emails=tuple(filter(None, [msg.get("To", "")])),
            cc_emails=tuple(filter(None, [msg.get("Cc", "")])),
            date=msg.get("Date"),
            in_reply_to=msg.get("In-Reply-To"),
            references=refs,
            seen="\\seen" in lowered,
            flagged="\\flagged" in lowered,
            answered="\\answered" in lowered,
            deleted="\\deleted" in lowered,
            keywords=keywords,
            attachments=attachments,
        )

    def list_messages(
        self,
        folder: str,
        *,
        before_uid: int | None = None,
        limit: int = 50,
    ) -> list[MailboxMessage]:
        if limit <= 0 or limit > 200:
            raise ValueError("limit must be between 1 and 200")
        if before_uid is not None and before_uid <= 1:
            return []
        self.set_source_folder(folder)
        self._client.select_folder(folder, readonly=True)
        self._check_uidvalidity(folder)
        criteria = ["UID", f"1:{before_uid - 1}"] if before_uid else ["ALL"]
        uids = [int(uid) for uid in self._client.search(criteria)]
        selected = sorted(uids, reverse=True)[:limit]
        if not selected:
            return []
        raw = self._client.fetch(
            selected,
            ["BODY.PEEK[HEADER]", "BODYSTRUCTURE", "FLAGS"],
        )
        return [
            self._mailbox_message_from_fetch(folder, uid, raw[uid])
            for uid in selected
            if uid in raw
        ]

    def fetch_message(self, folder: str, uid: int) -> EmailData:
        self.set_source_folder(folder)
        self._client.select_folder(folder, readonly=True)
        data = self._client.fetch([uid], ["RFC822", "BODYSTRUCTURE"])
        if uid not in data:
            raise KeyError(uid)
        parsed = self._email_data_from_fetch(uid, data[uid])
        raw = data[uid].get(b"RFC822", b"")
        body_text, body_html = self._extract_message_body(raw)
        return replace(parsed, body_text=body_text, body_html=body_html)

    @staticmethod
    def _extract_message_body(raw: bytes) -> tuple[str, str]:
        from mailflow_core.providers.imap_generic import _extract_body

        return _extract_body(email.message_from_bytes(raw))

    def set_seen(self, folder: str, uid: int, seen: bool) -> None:
        self._client.select_folder(folder)
        if seen:
            self._client.add_flags([uid], [r"\Seen"])
        else:
            self._client.remove_flags([uid], [r"\Seen"])

    def set_flagged(self, folder: str, uid: int, flagged: bool) -> None:
        self._client.select_folder(folder)
        if flagged:
            self._client.add_flags([uid], [r"\Flagged"])
        else:
            self._client.remove_flags([uid], [r"\Flagged"])

    def apply_tags(self, uid: int, tags: list[str] | tuple[str, ...]) -> None:
        safe = [keyword for tag in tags if (keyword := _safe_keyword(tag)) != "MailFlow-"]
        if not safe:
            return
        self._client.select_folder(self._source_folder)
        self._client.add_flags([uid], list(dict.fromkeys(safe)))

    def remove_tags(self, folder: str, uid: int, tags: list[str] | tuple[str, ...]) -> None:
        safe = [keyword for tag in tags if (keyword := _safe_keyword(tag)) != "MailFlow-"]
        if not safe:
            return
        self._client.select_folder(folder)
        self._client.remove_flags([uid], list(dict.fromkeys(safe)))

    def move_from_folder(self, folder: str, uid: int, destination_folder: str) -> bool:
        self.set_source_folder(folder)
        return self.move_email(uid, destination_folder)

    def trash_email(self, folder: str, uid: int) -> bool:
        trash = self._special_folder("trash")
        if not trash:
            return False
        if folder == trash:
            return True
        return self.move_from_folder(folder, uid, trash)

    def mark_spam(self, folder: str, uid: int) -> bool:
        spam = self._special_folder("spam")
        if not spam:
            return False
        if folder == spam:
            return True
        return self.move_from_folder(folder, uid, spam)

    def archive_email(self, folder: str, uid: int) -> bool:
        archive = self._special_folder("archive")
        if not archive:
            return False
        if folder == archive:
            return True
        return self.move_from_folder(folder, uid, archive)
