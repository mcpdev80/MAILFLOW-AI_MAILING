"""Mailbox routing policy kept separate from semantic classification."""

from __future__ import annotations

from mailflow_core.types import ClassificationResult

from app.models.email_account import EmailAccount


def destination_for_classification(
    account: EmailAccount,
    classification: ClassificationResult,
) -> str:
    """Map classification data to the current mailbox folder behavior.

    Existing installations encode folder destinations in the legacy ``label``.
    Keep that adapter here during migration so classifiers can move to semantic
    categories without owning IMAP routing decisions.
    """
    if classification.label and classification.label != "unclassified":
        return classification.label
    return account.unclassified_folder
