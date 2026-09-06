from uuid import uuid4

import pytest

from app.attachment_storage import AttachmentStorage


def test_put_deduplicates_same_content(tmp_path) -> None:
    storage = AttachmentStorage(tmp_path, max_bytes=1024)
    org_id = uuid4()

    first = storage.put(org_id, b"same document")
    second = storage.put(org_id, b"same document")

    assert first.content_sha256 == second.content_sha256
    assert first.storage_key == second.storage_key
    assert first.created is True
    assert second.created is False
    assert storage.read(first.storage_key) == b"same document"


def test_same_content_is_namespaced_per_organization(tmp_path) -> None:
    storage = AttachmentStorage(tmp_path, max_bytes=1024)

    first = storage.put(uuid4(), b"same document")
    second = storage.put(uuid4(), b"same document")

    assert first.content_sha256 == second.content_sha256
    assert first.storage_key != second.storage_key


def test_rejects_oversized_content(tmp_path) -> None:
    storage = AttachmentStorage(tmp_path, max_bytes=3)
    with pytest.raises(ValueError, match="attachment_too_large"):
        storage.put(uuid4(), b"1234")


def test_rejects_path_traversal_on_read(tmp_path) -> None:
    storage = AttachmentStorage(tmp_path)
    with pytest.raises(ValueError, match="invalid_storage_key"):
        storage.read("../secret")
