"""Mailbox routing policy kept separate from semantic classification."""

from __future__ import annotations

from mailflow_core.types import ClassificationResult

from app.models.email_account import EmailAccount


def destination_for_classification(
    account: EmailAccount,
    classification: ClassificationResult,
) -> str:
    """Map semantic classification to a provider folder configured per account."""
    config = dict(getattr(account, "structure_config", None) or {})
    folders = config.get("folders")
    routes = config.get("routes")
    if isinstance(folders, dict) and isinstance(routes, list):
        exact: str | None = None
        category_only: str | None = None
        for route in routes:
            if (
                not isinstance(route, dict)
                or route.get("category") != classification.category
            ):
                continue
            route_subcategory = route.get("subcategory")
            folder_id = route.get("folder_id")
            if not isinstance(folder_id, str):
                continue
            destination = folders.get(folder_id)
            if not isinstance(destination, str) or not destination:
                continue
            if route_subcategory is None:
                category_only = destination
            elif classification.subcategory == route_subcategory:
                exact = destination
                break
        if exact is not None:
            return exact
        if category_only is not None:
            return category_only

    # Compatibility fallback for accounts that have not completed structure setup.
    if classification.label and classification.label != "unclassified":
        return classification.label
    return account.unclassified_folder
