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
    ThreadSummaryUpdate,
)

_CLASSIFY_SYSTEM = (
    "You are an email classification assistant. Classify the current message semantically; "
    "do not choose an IMAP folder. Use only one confirmed category provided by the caller. "
    "If thread context is provided, treat it as context only: the current message is authoritative "
    "and previous classifications must not be copied blindly. If nothing fits, use category 'other' "
    "and optionally suggest a category for human review. Return ONLY a JSON object with category, "
    "optional subcategory, optional suggested_category, optional suggested_subcategory, importance, "
    "urgency, action_required, system_tags, user_tags, confidence, needs_more_context, "
    "review_required and a short optional reason. importance must be "
    "critical/high/normal/low/unknown; urgency must be immediate/today/this_week/none/unknown; "
    "action_required must be yes/no/unknown."
)

_THREAD_SUMMARY_SYSTEM = (
    "Maintain one compact email-thread summary. Use ONLY the existing summary and the new current "
    "message. Never reconstruct or request full thread history. Return ONLY JSON with: changed "
    "(boolean), summary (string), open_action_required (boolean), deadline (string or null). "
    "The summary must capture current topic, status, open points, who needs to act, and any deadline. "
    "Set changed=false when the new message adds no relevant thread information; in that case keep "
    "the existing summary unchanged. Keep the summary concise."
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
        thread_summary: str | None = None,
    ) -> ClassificationResult:
        """Classify the current message with optional compact thread context."""
        categories = available_categories or list(CONFIRMED_CATEGORIES)
        invalid_categories = set(categories) - set(CONFIRMED_CATEGORIES)
        if invalid_categories:
            raise ClassificationError(
                f"Unsupported confirmed categories: {sorted(invalid_categories)}"
            )

        context = ""
        if thread_summary:
            context = f"Thread context (context only):\n{thread_summary[:1500]}\n\n"
        user_msg = (
            f"Confirmed categories: {', '.join(categories)}\n\n"
            f"{context}"
            f"Current message:\n"
            f"Subject: {email.subject_normalized}\n"
            f"From: {email.from_email}\n\n"
            f"{email.body_text[:1000]}"
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

    def update_thread_summary(
        self,
        previous_summary: str,
        email: ParsedEmail,
        classification: ClassificationResult,
    ) -> ThreadSummaryUpdate:
        """Update compact thread context using only prior summary plus the new message."""
        user_msg = (
            f"Existing summary:\n{previous_summary[:1500] or '(none)'}\n\n"
            f"New message:\n"
            f"Subject: {email.subject_normalized}\n"
            f"From: {email.from_email}\n"
            f"To: {', '.join(email.to_emails)}\n\n"
            f"{email.body_text[:1200]}\n\n"
            f"Current classification:\n"
            f"category={classification.category}; importance={classification.importance}; "
            f"urgency={classification.urgency}; action_required={classification.action_required}"
        )
        raw = self._call(
            [
                {"role": "system", "content": _THREAD_SUMMARY_SYSTEM},
                {"role": "user", "content": user_msg},
            ]
        )
        try:
            data = json.loads(raw)
            changed = bool(data["changed"])
            summary = str(data["summary"]).strip()
            open_action_required = bool(data["open_action_required"])
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            raise ClassificationError(f"Invalid thread summary response: {raw!r}") from exc

        if not changed:
            summary = previous_summary
        if not summary:
            summary = previous_summary or email.subject_normalized[:500]
        deadline = _optional_text(data.get("deadline"))
        return ThreadSummaryUpdate(
            summary=summary[:2000],
            changed=changed,
            open_action_required=open_action_required,
            deadline=deadline,
        )

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
