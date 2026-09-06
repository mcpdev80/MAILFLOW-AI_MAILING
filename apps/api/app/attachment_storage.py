"""Content-addressed filesystem storage for safe attachment binaries."""

from __future__ import annotations

import hashlib
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from app.attachment_library_config import attachment_library_settings


@dataclass(frozen=True)
class StoredAttachment:
    content_sha256: str
    storage_key: str
    size_bytes: int
    created: bool


class AttachmentStorage:
    """Store one immutable binary per organization/content hash."""

    def __init__(self, root: str | Path | None = None, *, max_bytes: int | None = None) -> None:
        self.root = Path(root or attachment_library_settings.ATTACHMENT_LIBRARY_STORAGE_PATH)
        self.max_bytes = max_bytes or attachment_library_settings.ATTACHMENT_LIBRARY_MAX_BYTES

    def put(self, org_id: UUID, payload: bytes) -> StoredAttachment:
        if len(payload) > self.max_bytes:
            raise ValueError("attachment_too_large")
        digest = hashlib.sha256(payload).hexdigest()
        storage_key = self._key(org_id, digest)
        target = self._resolve_key(storage_key)
        if target.exists():
            return StoredAttachment(digest, storage_key, len(payload), False)

        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd, tmp_name = tempfile.mkstemp(prefix=".attachment-", dir=target.parent)
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, "wb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            try:
                os.link(tmp_name, target)
                created = True
            except FileExistsError:
                created = False
        finally:
            try:
                os.unlink(tmp_name)
            except FileNotFoundError:
                pass
        return StoredAttachment(digest, storage_key, len(payload), created)

    def read(self, storage_key: str) -> bytes:
        return self._resolve_key(storage_key).read_bytes()

    def delete(self, storage_key: str) -> None:
        try:
            self._resolve_key(storage_key).unlink()
        except FileNotFoundError:
            return

    @staticmethod
    def _key(org_id: UUID, digest: str) -> str:
        return f"{org_id}/{digest[:2]}/{digest[2:4]}/{digest}"

    def _resolve_key(self, storage_key: str) -> Path:
        root = self.root.resolve()
        candidate = (root / storage_key).resolve()
        if candidate == root or root not in candidate.parents:
            raise ValueError("invalid_storage_key")
        return candidate


attachment_storage = AttachmentStorage()
