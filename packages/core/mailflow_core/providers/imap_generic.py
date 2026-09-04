"""IMAP email provider with staged body and attachment fetching."""

from __future__ import annotations

import email
from email.message import Message

import imapclient

from mailflow_core.attachments import (
    AttachmentExtractionConfig,
    ExtractedAttachment,
    eligible_attachments,
    extract_attachment,
)
from mailflow_core.exceptions import IMAPConnectionError, UIDValidityChanged
from mailflow_core.mail_auth import normalize_mail_auth_signals
from mailflow_core.providers.base import DraftRef, EmailData, EmailProvider
from mailflow_core.types import AttachmentInfo

_MAILFLOW_KEYWORD = "MailFlowProcessed"
_MAILFLOW_DRAFT_HEADER = "X-MailFlow-Draft"


def _extract_body(msg: Message) -> tuple[str, str]:
    body_text = ""
    body_html = ""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            charset = part.get_content_charset() or "utf-8"
            if content_type == "text/plain" and not body_text:
                body_text = part.get_payload(decode=True).decode(charset, errors="replace")
            elif content_type == "text/html" and not body_html:
                body_html = part.get_payload(decode=True).decode(charset, errors="replace")
    else:
        content_type = msg.get_content_type()
        charset = msg.get_content_charset() or "utf-8"
        payload = msg.get_payload(decode=True).decode(charset, errors="replace")
        if content_type == "text/plain":
            body_text = payload
        elif content_type == "text/html":
            body_html = payload
    return body_text, body_html


def _first_fetch_bytes(data: dict) -> bytes:
    for key, value in data.items():
        if (
            isinstance(key, bytes)
            and key not in {b"SEQ", b"BODYSTRUCTURE"}
            and isinstance(value, bytes)
        ):
            return value
    return b""


def _decode_atom(value: object) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value or "")


def _parameter_dict(value: object) -> dict[str, str]:
    if not isinstance(value, tuple):
        return {}
    result: dict[str, str] = {}
    items = list(value)
    for index in range(0, len(items) - 1, 2):
        result[_decode_atom(items[index]).lower()] = _decode_atom(items[index + 1])
    return result


def _find_disposition(structure: tuple) -> tuple[str | None, dict[str, str]]:
    for value in structure[7:]:
        if not isinstance(value, tuple) or not value:
            continue
        disposition = _decode_atom(value[0]).lower()
        if disposition in {"attachment", "inline"}:
            params = _parameter_dict(value[1] if len(value) > 1 else None)
            return disposition, params
    return None, {}


def _attachment_metadata(structure: object, prefix: str = "") -> tuple[AttachmentInfo, ...]:
    """Convert an IMAP BODYSTRUCTURE tuple into lightweight attachment metadata."""
    if not isinstance(structure, tuple) or not structure:
        return ()

    if isinstance(structure[0], tuple):
        attachments: list[AttachmentInfo] = []
        part_index = 1
        for child in structure:
            if not isinstance(child, tuple):
                break
            part_id = f"{prefix}.{part_index}" if prefix else str(part_index)
            attachments.extend(_attachment_metadata(child, part_id))
            part_index += 1
        return tuple(attachments)

    if len(structure) < 7:
        return ()
    media_type = _decode_atom(structure[0]).lower()
    subtype = _decode_atom(structure[1]).lower()
    mime_type = f"{media_type}/{subtype}"
    params = _parameter_dict(structure[2])
    disposition, disposition_params = _find_disposition(structure)
    filename = disposition_params.get("filename") or params.get("name") or ""
    if disposition != "attachment" and not filename:
        return ()
    try:
        size = int(structure[6]) if structure[6] is not None else None
    except (TypeError, ValueError):
        size = None
    return (
        AttachmentInfo(
            part_id=prefix or "1",
            filename=filename or f"attachment-{prefix or '1'}",
            mime_type=mime_type,
            size=size,
            disposition=disposition,
        ),
    )


class ImapGenericProvider(EmailProvider):
    """IMAP provider using password or OAuth2 authentication."""

    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str | None = None,
        use_ssl: bool = True,
        access_token: str | None = None,
        attachment_config: AttachmentExtractionConfig | None = None,
    ) -> None:
        if not password and not access_token:
            raise ValueError("ImapGenericProvider requires password or access_token")
        self._host = host
        self._port = port
        self._username = username
        self._password = password
        self._access_token = access_token
        self._use_ssl = use_ssl
        self._attachment_config = attachment_config or AttachmentExtractionConfig()
        self._attachment_metadata_cache: dict[int, tuple[AttachmentInfo, ...]] = {}
        self._attachment_extraction_cache: dict[tuple[int, str], ExtractedAttachment] = {}
        self._client: imapclient.IMAPClient | None = None
        self._separator: str = "/"
        self._drafts_folder: str = "Drafts"
        self._uidvalidity: dict[str, int] = {}

    def connect(self) -> None:
        try:
            self._client = imapclient.IMAPClient(
                self._host, port=self._port, use_uid=True, ssl=self._use_ssl
            )
            if self._access_token:
                self._client.oauth2_login(self._username, self._access_token)
            else:
                self._client.login(self._username, self._password)
            self._detect_separator()
            self._detect_drafts_folder()
        except IMAPConnectionError:
            raise
        except Exception as exc:
            raise IMAPConnectionError(str(exc)) from exc

    def disconnect(self) -> None:
        if self._client:
            try:
                self._client.logout()
            except Exception:
                pass
            self._client = None

    def keep_alive(self) -> None:
        if self._client:
            self._client.noop()

    def _detect_separator(self) -> None:
        folders = self._client.list_folders()
        if folders:
            _, delimiter, _ = folders[0]
            self._separator = (
                delimiter.decode() if isinstance(delimiter, bytes) else (delimiter or "/")
            )

    def _detect_drafts_folder(self) -> None:
        for flags, _, name in self._client.list_folders():
            str_flags = [flag.decode() if isinstance(flag, bytes) else flag for flag in flags]
            if "\\Drafts" in str_flags:
                self._drafts_folder = name
                return

    def _check_uidvalidity(self, folder: str) -> None:
        status = self._client.folder_status(folder, ["UIDVALIDITY"])
        current = int(status[b"UIDVALIDITY"])
        previous = self._uidvalidity.get(folder)
        if previous is not None and previous != current:
            raise UIDValidityChanged(folder, previous, current)
        self._uidvalidity[folder] = current

    def fetch_unprocessed_emails(self, max_count: int = 20) -> list[EmailData]:
        """Fetch candidate headers, transport signals and BODYSTRUCTURE metadata only."""
        self._client.select_folder("INBOX")
        self._check_uidvalidity("INBOX")
        uids = self._client.search(["NOT", "KEYWORD", _MAILFLOW_KEYWORD])[:max_count]
        if not uids:
            return []
        raw_messages = self._client.fetch(uids, ["BODY.PEEK[HEADER]", "BODYSTRUCTURE"])
        result: list[EmailData] = []
        for uid, data in raw_messages.items():
            msg = email.message_from_bytes(_first_fetch_bytes(data))
            refs_str = msg.get("References", "") or ""
            attachments = _attachment_metadata(data.get(b"BODYSTRUCTURE"))
            self._attachment_metadata_cache[uid] = attachments
            result.append(
                EmailData(
                    uid=uid,
                    message_id=msg.get("Message-ID", ""),
                    subject=msg.get("Subject", ""),
                    from_email=msg.get("From", ""),
                    to_emails=[msg.get("To", "")],
                    in_reply_to=msg.get("In-Reply-To"),
                    references=[part for part in refs_str.split() if part],
                    date=msg.get("Date"),
                    reply_to=msg.get("Reply-To"),
                    list_id=msg.get("List-ID"),
                    precedence=msg.get("Precedence"),
                    auth_signals=normalize_mail_auth_signals(msg),
                    attachments=attachments,
                )
            )
        return result

    def fetch_body(self, uid: int, max_chars: int | None = None) -> tuple[str, str]:
        """Fetch bounded body text; final-stage fetch may add bounded attachment context."""
        self._client.select_folder("INBOX")
        if max_chars is None:
            data = self._client.fetch([uid], ["RFC822"])[uid]
            raw = data.get(b"RFC822", b"")
            body_text, body_html = _extract_body(email.message_from_bytes(raw))
            extracted = self._extract_relevant_attachments(uid)
            used = tuple(item for item in extracted if item.status == "used" and item.text)
            if used:
                context = "\n\n".join(item.prompt_block() for item in used)
                body_text = (
                    f"{body_text}\n\n" if body_text else ""
                ) + f"BEGIN_UNTRUSTED_ATTACHMENT_CONTEXT\n{context}\nEND_UNTRUSTED_ATTACHMENT_CONTEXT"
            return body_text, body_html

        max_bytes = max(max_chars * 2, max_chars)
        data = self._client.fetch([uid], [f"BODY.PEEK[TEXT]<0.{max_bytes}>"])[uid]
        raw = _first_fetch_bytes(data)
        return raw.decode("utf-8", errors="replace")[:max_chars], ""

    def _extract_relevant_attachments(self, uid: int) -> tuple[ExtractedAttachment, ...]:
        metadata = self._attachment_metadata_cache.get(uid, ())
        selected = eligible_attachments(metadata, self._attachment_config)
        results: list[ExtractedAttachment] = []
        for attachment in selected:
            key = (uid, attachment.part_id)
            cached = self._attachment_extraction_cache.get(key)
            if cached is not None:
                results.append(cached)
                continue
            payload = self.fetch_attachment_content(uid, attachment)
            result = extract_attachment(
                attachment,
                payload,
                config=self._attachment_config,
            )
            self._attachment_extraction_cache[key] = result
            results.append(result)
        return tuple(results)

    def fetch_attachment_content(self, uid: int, attachment: AttachmentInfo) -> bytes:
        """Fetch exactly one MIME part selected from previously discovered BODYSTRUCTURE metadata."""
        self._client.select_folder("INBOX")
        data = self._client.fetch([uid], [f"BODY.PEEK[{attachment.part_id}]"])[uid]
        return _first_fetch_bytes(data)

    def move_email(self, uid: int, destination_folder: str) -> bool:
        self.ensure_folder_exists(destination_folder)
        self._client.select_folder("INBOX")
        try:
            self._client.copy([uid], destination_folder)
            self._client.add_flags([uid], [r"\Deleted"])
            self._client.expunge()
            return True
        except Exception:
            return False

    def mark_as_processed(self, uid: int) -> None:
        self._client.select_folder("INBOX")
        self._client.add_flags([uid], [_MAILFLOW_KEYWORD])

    def ensure_folder_exists(self, folder_path: str) -> None:
        parts = folder_path.split(self._separator)
        current = ""
        for part in parts:
            current = f"{current}{self._separator}{part}" if current else part
            if not self._client.folder_exists(current):
                self._client.create_folder(current)

    def find_drafts_in_thread(self, original_message_id: str) -> list[DraftRef]:
        self._client.select_folder(self._drafts_folder)
        uids = self._client.search(["HEADER", "In-Reply-To", original_message_id])
        if not uids:
            return []
        raw_messages = self._client.fetch(uids, ["RFC822", "FLAGS"])
        drafts: list[DraftRef] = []
        for uid, data in raw_messages.items():
            msg = email.message_from_bytes(data[b"RFC822"])
            drafts.append(
                DraftRef(
                    uid=uid,
                    folder=self._drafts_folder,
                    message_id=msg.get("Message-ID"),
                    in_reply_to=msg.get("In-Reply-To"),
                    has_mailflow_header=_MAILFLOW_DRAFT_HEADER in msg,
                )
            )
        return drafts

    def save_draft(self, message_bytes: bytes) -> bool:
        try:
            self.ensure_folder_exists(self._drafts_folder)
            self._client.append(self._drafts_folder, message_bytes, flags=[r"\Draft"])
            return True
        except Exception:
            return False

    def delete_draft(self, uid: int) -> bool:
        try:
            self._client.select_folder(self._drafts_folder)
            self._client.add_flags([uid], [r"\Deleted"])
            self._client.expunge()
            return True
        except Exception:
            return False
