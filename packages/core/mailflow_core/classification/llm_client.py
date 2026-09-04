"""LiteLLM wrapper for email classification and draft generation."""

from __future__ import annotations

import json
from dataclasses import dataclass, replace

import litellm

from mailflow_core.exceptions import ClassificationError, LLMError
from mailflow_core.types import (
    CONFIRMED_CATEGORIES,
    ClassificationResult,
    DraftRequest,
    ParsedEmail,
)

_CLASSIFY_SYSTEM = (
    "You are an email classification assistant. Classify the message semantically; "
    "do not choose an IMAP folder. Use only one confirmed category provided by the caller. "
    "If nothing fits, use category 'other' and optionally suggest a category for human review. "
    "Return ONLY a JSON object with category, optional subcategory, optional suggested_category, "
    "optional suggested_subcategory, importance, urgency, action_required, system_tags, user_tags, "
    "confidence, needs_more_context, review_required and a short optional reason. "
    "importance must be critical/high/normal/low/unknown; urgency must be "
    "immediate/today/this_week/none/unknown; action_required must be yes/no/unknown."
)

_DRAFT_SYSTEM = (
    "You are a professional email drafting assistant. "
    "Write a reply in the same language as the original email. "
    "Return only the body text — no subject line, no headers, no signature placeholder."
)


@dataclass
class LLMConfig:
    model_id: str
    api_base: str | None = None
    api_key: str | None = None
    timeout: float = 30.0
    max_retries: int = 2
    review_confidence_threshold: float = 0.60


class LLMClient:
    """Wrapper around litellm.completion for classify and generate_draft."""

    def __init__(self, config: LLMConfig) -> None:
        self._config = config

    def _call(self, messages: list[dict]) -> str:
        kwargs: dict = {
            "model": self._config.model_id,
            "messages": messages,
            "timeout": self._config.timeout,
            "num_retries": self._config.max_retries,
        }
        if self._config.api_base:
            kwargs["api_base"] = self._config.api_base
        if self._config.api_key:
            kwargs["api_key"] = self._config.api_key
        try:
            response = litellm.completion(**kwargs)
            return response.choices[0].message.content or ""
        except Exception as exc:
            raise LLMError(str(exc)) from exc

    def classify(
        self,
        email: ParsedEmail,
        available_labels: list[str] | None = None,
        available_categories: list[str] | None = None,
    ) -> ClassificationResult:
        """Classify semantically while accepting legacy label-only callers/responses."""
        categories = available_categories or list(CONFIRMED_CATEGORIES)
        invalid_categories = set(categories) - set(CONFIRMED_CATEGORIES)
        if invalid_categories:
            raise ClassificationError(
                f"Unsupported confirmed categories: {sorted(invalid_categories)}"
            )

        user_msg = (
            f"Confirmed categories: {', '.join(categories)}\n\n"
            f"Subject: {email.subject_normalized}\n"
            f"From: {email.from_email}\n\n"
            f"{email.body_text[:500]}"
        )
        raw = self._call(
            [
                {"role": "system", "content": _CLASSIFY_SYSTEM},
                {"role": "user", "content": user_msg},
            ]
        )
        try:
            data = json.loads(raw)
            confidence = float(data["confidence"])
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            raise ClassificationError(f"Invalid LLM response: {raw!r}") from exc

        # Compatibility: older models returned only label + confidence. Keep that
        # contract usable while new models return category as the primary concept.
        raw_category = data.get("category")
        legacy_label = data.get("label")
        if raw_category is None:
            if not isinstance(legacy_label, str):
                raise ClassificationError(f"Invalid LLM response: {raw!r}")
            if available_labels is not None and legacy_label not in available_labels:
                raise ClassificationError(
                    f"Label {legacy_label!r} not in available labels: {available_labels}"
                )
            category = legacy_label if legacy_label in categories else "other"
            label = legacy_label
        else:
            if not isinstance(raw_category, str) or raw_category not in categories:
                raise ClassificationError(
                    f"Category {raw_category!r} not in confirmed categories: {categories}"
                )
            category = raw_category
            label = str(legacy_label or category)

        importance = str(data.get("importance", "unknown"))
        urgency = str(data.get("urgency", "unknown"))
        action_required = str(data.get("action_required", "unknown"))
        needs_more_context = bool(data.get("needs_more_context", False))
        review_required = bool(data.get("review_required", False)) or (
            confidence < self._config.review_confidence_threshold
        )
        reason = data.get("reason")
        if reason is not None:
            reason = str(reason).strip()[:300] or None

        try:
            result = ClassificationResult(
                label=label,
                confidence=confidence,
                method="llm",
                category=category,  # type: ignore[arg-type]
                subcategory=_optional_text(data.get("subcategory")),
                suggested_category=_optional_text(data.get("suggested_category")),
                suggested_subcategory=_optional_text(data.get("suggested_subcategory")),
                importance=importance,  # type: ignore[arg-type]
                urgency=urgency,  # type: ignore[arg-type]
                action_required=action_required,  # type: ignore[arg-type]
                system_tags=_string_tuple(data.get("system_tags")),
                user_tags=_string_tuple(data.get("user_tags")),
                needs_more_context=needs_more_context,
                review_required=review_required,
                reason=reason,
            )
        except (TypeError, ValueError) as exc:
            raise ClassificationError(f"Invalid LLM response: {raw!r}") from exc

        if result.review_required and result.reason is None:
            reason = (
                "more context required"
                if result.needs_more_context
                else "classification requires review"
            )
            result = replace(result, reason=reason)
        return result

    def generate_draft(self, original_email: ParsedEmail, request: DraftRequest) -> str:
        classification = request.classification.category
        if classification == "other" and request.classification.label:
            classification = request.classification.label
        user_msg = (
            f"Original email:\nSubject: {original_email.subject_normalized}\n"
            f"From: {original_email.from_email}\n\n"
            f"{original_email.body_text[:500]}\n\n"
            f"Classification: {classification}\n"
            f"Reply subject: {request.subject}"
        )
        return self._call(
            [
                {"role": "system", "content": _DRAFT_SYSTEM},
                {"role": "user", "content": user_msg},
            ]
        )


def _optional_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text[:255] or None


def _string_tuple(value: object) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise ValueError("tags must be arrays")
    return tuple(str(item).strip() for item in value if str(item).strip())
