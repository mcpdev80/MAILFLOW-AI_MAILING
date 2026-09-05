"""Deterministic mailbox structure discovery, matching and proposal helpers."""

from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from typing import Literal

SUPPORTED_LOCALES = {"de", "en", "es"}

FOLDER_LABELS: dict[str, dict[str, str]] = {
    "important": {"en": "Important", "de": "Wichtig", "es": "Importante"},
    "work": {"en": "Work", "de": "Arbeit", "es": "Trabajo"},
    "private": {"en": "Private", "de": "Privat", "es": "Privado"},
    "invoices": {"en": "Invoices", "de": "Rechnungen", "es": "Facturas"},
    "orders": {"en": "Orders", "de": "Bestellungen", "es": "Pedidos"},
    "appointments": {"en": "Appointments", "de": "Termine", "es": "Citas"},
    "newsletters": {"en": "Newsletters", "de": "Newsletter", "es": "Boletines"},
    "notifications": {
        "en": "Notifications",
        "de": "Benachrichtigungen",
        "es": "Notificaciones",
    },
    "archive": {"en": "Archive", "de": "Archiv", "es": "Archivo"},
}

TAG_LABELS: dict[str, dict[str, str]] = {
    "urgent": {"en": "Urgent", "de": "Dringend", "es": "Urgente"},
    "action_required": {
        "en": "Action required",
        "de": "Aktion erforderlich",
        "es": "Acción requerida",
    },
    "today": {"en": "Today", "de": "Heute", "es": "Hoy"},
    "this_week": {"en": "This week", "de": "Diese Woche", "es": "Esta semana"},
    "information_only": {
        "en": "Information only",
        "de": "Nur Information",
        "es": "Solo información",
    },
    "follow_up": {"en": "Follow up", "de": "Nachfassen", "es": "Seguimiento"},
}

DEFAULT_ROUTES = (
    {"category": "work", "subcategory": None, "folder_id": "work"},
    {"category": "private", "subcategory": None, "folder_id": "private"},
    {"category": "finance", "subcategory": "invoices", "folder_id": "invoices"},
    {"category": "orders", "subcategory": None, "folder_id": "orders"},
    {"category": "appointments", "subcategory": None, "folder_id": "appointments"},
    {"category": "newsletters", "subcategory": None, "folder_id": "newsletters"},
    {"category": "notifications", "subcategory": None, "folder_id": "notifications"},
)


def normalize_name(value: str) -> str:
    value = unicodedata.normalize("NFKD", value.casefold())
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "", value)


def _aliases(labels: dict[str, str]) -> set[str]:
    return {normalize_name(value) for value in labels.values()}


def best_match(
    labels: dict[str, str], existing: list[str]
) -> tuple[str | None, float, Literal["exact", "equivalent", "possible", "none"]]:
    if not existing:
        return None, 0.0, "none"
    aliases = _aliases(labels)
    normalized_existing = [(name, normalize_name(name)) for name in existing]
    for name, normalized in normalized_existing:
        if normalized in aliases:
            preferred = normalize_name(labels.get("en", ""))
            return (
                name,
                1.0 if normalized == preferred else 0.98,
                ("exact" if normalized == preferred else "equivalent"),
            )

    best_name: str | None = None
    best_score = 0.0
    for name, normalized in normalized_existing:
        for alias in aliases:
            score = SequenceMatcher(None, normalized, alias).ratio()
            if score > best_score:
                best_name = name
                best_score = score
    if best_score >= 0.78:
        return best_name, round(best_score, 3), "possible"
    return None, round(best_score, 3), "none"


def localized_label(labels: dict[str, str], locale: str) -> str:
    return labels.get(locale if locale in SUPPORTED_LOCALES else "en", labels["en"])


def build_proposal(
    *,
    locale: str,
    existing_folders: list[str],
    existing_tags: list[str],
    current_config: dict | None = None,
) -> dict[str, object]:
    locale = locale if locale in SUPPORTED_LOCALES else "en"
    folders: list[dict[str, object]] = []
    for internal_id, labels in FOLDER_LABELS.items():
        matched, confidence, kind = best_match(labels, existing_folders)
        folders.append(
            {
                "internal_id": internal_id,
                "proposed_name": localized_label(labels, locale),
                "existing_match": matched,
                "match_confidence": confidence,
                "match_kind": kind,
                "suggested_action": "reuse"
                if kind in {"exact", "equivalent"}
                else "review"
                if kind == "possible"
                else "create",
            }
        )

    tags: list[dict[str, object]] = []
    for internal_id, labels in TAG_LABELS.items():
        matched, confidence, kind = best_match(labels, existing_tags)
        tags.append(
            {
                "internal_id": internal_id,
                "proposed_name": localized_label(labels, locale),
                "existing_match": matched,
                "match_confidence": confidence,
                "match_kind": kind,
                "suggested_action": "reuse"
                if kind in {"exact", "equivalent"}
                else "review"
                if kind == "possible"
                else "create",
            }
        )

    return {
        "locale": locale,
        "existing_folders": sorted(set(existing_folders), key=str.casefold),
        "existing_tags": sorted(set(existing_tags), key=str.casefold),
        "folders": folders,
        "tags": tags,
        "routes": [dict(route) for route in DEFAULT_ROUTES],
        "current_config": current_config or {},
    }
