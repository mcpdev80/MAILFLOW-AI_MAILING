from __future__ import annotations

import pytest

from app.services.attachment_document_ai import analyze_attachment_document
from mailflow_core.exceptions import ClassificationError


class FakeDocumentClient:
    def __init__(self, raw: str) -> None:
        self.raw = raw
        self.calls = 0
        self.messages = None

    def _call_classification(self, messages, primary_role, parser):
        self.calls += 1
        self.messages = messages
        assert primary_role == "deep"
        assert "UNTRUSTED" in messages[0]["content"]
        return parser(self.raw, "fake-model"), "deep"


def test_document_ai_parses_strict_supported_result_without_email_context() -> None:
    client = FakeDocumentClient(
        '{"document_type":"invoice","category":"finance","subcategory":"utilities",'
        '"confidence":0.93,"tags":["invoice","energy"]}'
    )
    result = analyze_attachment_document(
        client,  # type: ignore[arg-type]
        filename="document.pdf",
        mime_type="application/pdf",
        extracted_text="Invoice number 42 total EUR 100",
    )
    assert result.document_type == "invoice"
    assert result.category == "finance"
    assert result.subcategory == "utilities"
    assert result.confidence == pytest.approx(0.93)
    assert result.tags == ("invoice", "energy")
    assert client.calls == 1
    prompt = client.messages[1]["content"]
    assert "Sender:" not in prompt
    assert "Email subject:" not in prompt
    assert "Parent email" not in prompt


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
        )
