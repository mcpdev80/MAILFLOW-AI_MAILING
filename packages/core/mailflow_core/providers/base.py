"""Abstract EmailProvider interface.

All concrete providers (IMAP, Microsoft, Gmail) must implement this interface.
The API and worker depend only on this abstraction — never on concrete classes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from mailflow_core.types import AttachmentInfo, MailAuthSignals


@dataclass(frozen=True)
class EmailData:
    """Email headers plus optionally fetched body content."""

    uid: int
    message_id: str
    subject: str
    from_email: str
    to_emails: list[str]
    body_text: str = ""
    body_html: str = ""
    in_reply_to: str | None = None
    references: list[str] = field(default_factory=list)
    date: str | None = None
    reply_to: str | None = None
    list_id: str | None = None
    precedence: str | None = None
    auth_signals: MailAuthSignals = field(default_factory=MailAuthSignals)
    attachments: tuple[AttachmentInfo, ...] = ()


@dataclass(frozen=True)
class MailboxMessage:
    """Normalized lightweight message state for normal mail-client views."""

    uid: int
    folder: str
    message_id: str
    subject: str
    from_email: str
    to_emails: tuple[str, ...]
    cc_emails: tuple[str, ...] = ()
    date: str | None = None
    in_reply_to: str | None = None
    references: tuple[str, ...] = ()
    seen: bool = False
    flagged: bool = False
    answered: bool = False
    deleted: bool = False
    keywords: tuple[str, ...] = ()
    attachments: tuple[AttachmentInfo, ...] = ()


@dataclass(frozen=True)
class MailboxFolder:
    name: str
    delimiter: str
    role: str | None = None
    selectable: bool = True


@dataclass(frozen=True)
class ProviderCapabilities:
    """Capabilities exposed to UI/API without provider-specific assumptions."""

    read_state: bool = False
    flag: bool = False
    move: bool = False
    archive: bool = False
    trash: bool = False
    spam: bool = False
    restore: bool = False
    tags: bool = False
    attachments: bool = False


@dataclass(frozen=True)
class DraftRef:
    uid: int
    folder: str
    message_id: str | None
    in_reply_to: str | None
    has_mailflow_header: bool = False


class EmailProvider(ABC):
    """Abstract mailbox provider using UID-based operations."""

    @abstractmethod
    def connect(self) -> None: ...

    @abstractmethod
    def disconnect(self) -> None: ...

    def __enter__(self) -> EmailProvider:
        self.connect()
        return self

    def __exit__(self, *args: object) -> None:
        self.disconnect()

    @abstractmethod
    def keep_alive(self) -> None: ...

    @abstractmethod
    def fetch_unprocessed_emails(self, max_count: int = 20) -> list[EmailData]:
        """Fetch candidate headers and lightweight metadata without message bodies."""

    @abstractmethod
    def fetch_body(self, uid: int, max_chars: int | None = None) -> tuple[str, str]:
        """Fetch only the body content needed by the current classification stage."""

    def fetch_attachment_content(self, uid: int, attachment: AttachmentInfo) -> bytes:
        """Fetch one attachment payload when the provider supports staged attachment access."""
        raise NotImplementedError("attachment content fetching is not supported by this provider")

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities()

    def list_folders(self) -> list[MailboxFolder]:
        raise NotImplementedError("folder listing is not supported by this provider")

    def list_messages(
        self,
        folder: str,
        *,
        before_uid: int | None = None,
        limit: int = 50,
    ) -> list[MailboxMessage]:
        raise NotImplementedError("message listing is not supported by this provider")

    def fetch_message(self, folder: str, uid: int) -> EmailData:
        raise NotImplementedError("message reading is not supported by this provider")

    def find_message(
        self, message_id: str, folders: list[str] | None = None
    ) -> tuple[str, int] | None:
        """Resolve a stable Message-ID to the provider's current folder/UID location."""
        raise NotImplementedError("message lookup is not supported by this provider")

    def set_seen(self, folder: str, uid: int, seen: bool) -> None:
        raise NotImplementedError("read state is not supported by this provider")

    def set_flagged(self, folder: str, uid: int, flagged: bool) -> None:
        raise NotImplementedError("flagging is not supported by this provider")

    def remove_tags(self, folder: str, uid: int, tags: list[str] | tuple[str, ...]) -> None:
        raise NotImplementedError("tag removal is not supported by this provider")

    def trash_email(self, folder: str, uid: int) -> bool:
        raise NotImplementedError("trash is not supported by this provider")

    def mark_spam(self, folder: str, uid: int) -> bool:
        raise NotImplementedError("spam is not supported by this provider")

    @abstractmethod
    def move_email(self, uid: int, destination_folder: str) -> bool: ...

    @abstractmethod
    def mark_as_processed(self, uid: int) -> None: ...

    @abstractmethod
    def ensure_folder_exists(self, folder_path: str) -> None: ...

    @abstractmethod
    def find_drafts_in_thread(self, original_message_id: str) -> list[DraftRef]: ...

    @abstractmethod
    def save_draft(self, message_bytes: bytes) -> bool: ...

    @abstractmethod
    def delete_draft(self, uid: int) -> bool: ...
