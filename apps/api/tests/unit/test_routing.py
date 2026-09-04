"""Routing policy tests keep semantic classification separate from IMAP folders."""

from __future__ import annotations

from types import SimpleNamespace

from mailflow_core.types import ClassificationResult

from app.routing import destination_for_classification


def test_legacy_label_is_applied_only_by_routing_policy() -> None:
    account = SimpleNamespace(unclassified_folder="Needs review")
    result = ClassificationResult(
        label="Clients/Acme",
        category="work",
        importance="normal",
        urgency="none",
        action_required="no",
        confidence=0.95,
        method="domain_client",
    )

    assert result.category == "work"
    assert destination_for_classification(account, result) == "Clients/Acme"


def test_unclassified_routes_to_account_fallback_folder() -> None:
    account = SimpleNamespace(unclassified_folder="Needs review")
    result = ClassificationResult(
        label="unclassified",
        confidence=0.0,
        method="fallback",
    )

    assert destination_for_classification(account, result) == "Needs review"
