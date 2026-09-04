"""Focused unit coverage for bulk preview/apply result helpers."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

from mailflow_core.types import ClassificationResult, MailAuthSignals, ParsedEmail

from app.services.bulk_apply import BulkApplyService
from app.services.bulk_backfill import BulkBackfillService
from app.services.bulk_preview import _snapshot


def _classification(**overrides) -> ClassificationResult:
    values = {
        "label": "finance",
        "confidence": 0.96,
        "method": "llm",
        "category": "finance",
        "subcategory": "invoice",
        "importance": "normal",
        "urgency": "none",
        "action_required": "no",
        "system_tags": (),
        "user_tags": ("tax",),
        "review_required": False,
        "suspicious_content": False,
        "reason": "invoice detected",
        "classification_stage": 1,
        "classification_model": "fast-model",
    }
    values.update(overrides)
    return ClassificationResult(**values)


def test_preview_snapshot_is_compact_and_actionable(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.bulk_preview.settings.CLASSIFICATION_CONFIDENCE_THRESHOLD", 0.85
    )
    email_data = SimpleNamespace(message_id="<m1@example>")
    parsed = ParsedEmail(
        uid=42,
        subject_normalized="Invoice 2026",
        body_text="secret body that must not enter snapshot",
        body_html="<p>secret</p>",
        signature="private signature",
        from_email="billing@example.com",
        from_domain="example.com",
        date="2026-09-04",
        auth_signals=MailAuthSignals(),
    )

    value = _snapshot(
        email_data=email_data,
        parsed=parsed,
        result=_classification(),
        source_folder="INBOX",
        proposed_folder="Invoices",
        action_disposition="execute",
        action_reason="safe_automatic_action",
        do_move=True,
    )

    assert value["category"] == "finance"
    assert value["proposed_folder"] == "Invoices"
    assert value["do_move"] is True
    assert value["review_required"] is False
    assert value["classification_stage"] == 1
    assert "body_text" not in value
    assert "body_html" not in value
    assert "signature" not in value


def test_preview_snapshot_marks_low_confidence_for_review(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.bulk_preview.settings.CLASSIFICATION_CONFIDENCE_THRESHOLD", 0.85
    )
    parsed = ParsedEmail(
        uid=7,
        subject_normalized="Maybe invoice",
        body_text="",
        body_html="",
        signature="",
        from_email="sender@example.com",
        from_domain="example.com",
    )
    value = _snapshot(
        email_data=SimpleNamespace(message_id=None),
        parsed=parsed,
        result=_classification(confidence=0.5),
        source_folder="Archive",
        proposed_folder="Invoices",
        action_disposition="review",
        action_reason="confidence_below_action_threshold",
        do_move=False,
    )
    assert value["review_required"] is True
    assert value["do_move"] is False
    assert value["message_id"] is None


def test_bulk_backfill_result_maps_persisted_job_state() -> None:
    job = SimpleNamespace(
        id=uuid4(),
        account_id=uuid4(),
        state="running",
        cursor_uid=120,
        processed=80,
        successful=75,
        review_required=3,
        failed=2,
    )
    result = BulkBackfillService._result(
        job,
        requeue=True,
        yielded_for_retry=True,
        inference_health={"fast": {"degraded": False}},
    )
    assert result.job_id == job.id
    assert result.cursor_uid == 120
    assert result.requeue is True
    assert result.yielded_for_retry is True
    assert result.inference_health["fast"]["degraded"] is False


def test_bulk_apply_result_maps_independent_apply_progress() -> None:
    job = SimpleNamespace(
        id=uuid4(),
        account_id=uuid4(),
        state="completed",
        processed=10,
        applied=7,
        skipped=1,
        failed=1,
        review_required=1,
    )
    result = BulkApplyService._result(job, requeue=False)
    assert result.apply_job_id == job.id
    assert result.state == "completed"
    assert result.processed == 10
    assert result.applied == 7
    assert result.skipped == 1
    assert result.failed == 1
    assert result.review_required == 1
    assert result.requeue is False
