"""Abstract EmailProvider interface.

All concrete providers (IMAP, Microsoft, Gmail) must implement this interface.
The API and worker depend only on this abstraction — never on concrete classes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


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
        """Fetch candidate message headers without fetching message bodies."""

    @abstractmethod
    def fetch_body(self, uid: int, max_chars: int | None = None) -> tuple[str, str]:
        """Fetch only the body content needed by the current classification stage."""

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
