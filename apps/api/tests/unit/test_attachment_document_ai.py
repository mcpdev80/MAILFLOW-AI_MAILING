from __future__ import annotations

import pytest

from app.services.attachment_document_ai import analyze_attachment_document
from mailflow_core.exceptions import ClassificationError


class FakeDocumentClient:
    def __init__(self, raw: str) -> None:
        self.raw = raw
        self.calls = 0

    def _call_classification(self, messages, primary_role, parser):
        self.calls += 1
        assert primary_role == "deep"
        assert "UNTRUSTED" in messages[0]["content"]
        return parser(self.raw, "fake-model"), "deep"


def test_document_ai_parses_strict_supported_result() -> None:
    client = FakeDocumentClient(
        '{"document_type":"invoice","category":"finance","subcategory":"utilities",'
        '"confidence":0.93,"tags":["invoice","energy"]}'
    )
    result = analyze_attachment_document(
        client,  # type: ignore[arg-type]
        filename="document.pdf",
        mime_type="application/pdf",
        extracted_text="Invoice number 42 total EUR 100",
        email_category="other",
        email_subcategory=None,
        sender="billing@example.test",
        subject="Your document",
    )
    assert result.document_type == "invoice"
    assert result.category == "finance"
    assert result.subcategory == "utilities"
    assert result.confidence == pytest.approx(0.93)
    assert result.tags == ("invoice", "energy")
    assert client.calls == 1


def test_document_ai_rejects_unknown_document_type() -> None:
    client = FakeDocumentClient(
        '{"document_type":"malware","category":"other","subcategory":null,'
        '"confidence":0.9,"tags":[]}'
    )
    with pytest.raises(ClassificationError):
        analyze_attachment_document(
            client,  # type: ignore[arg-type]
            filename="document.pdf",
            mime_type="application/pdf",
            extracted_text="Some document text",
            email_category="other",
            email_subcategory=None,
            sender="sender@example.test",
            subject="Document",
        )
