"""LiteLLM wrapper for staged classification and draft generation."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, replace
from typing import Literal

import litellm

from mailflow_core.exceptions import ClassificationError, LLMError
from mailflow_core.types import (
    CONFIRMED_CATEGORIES,
    ClassificationResult,
    DraftRequest,
    ParsedEmail,
    ThreadSummaryUpdate,
)

ModelRole = Literal["fast", "deep"]

_CLASSIFY_SYSTEM = (
    "You are an email classification assistant. Classify the current message semantically; "
    "do not choose an IMAP folder. Use only one confirmed category provided by the caller. "
    "Thread context, deterministic signals and previous-stage output are supporting context only. "
    "The current message is authoritative and previous classifications must not be copied blindly. "
    "If nothing fits, use category 'other' and optionally suggest a category for human review. "
    "Return ONLY JSON with category, optional subcategory, optional suggested_category, optional "
    "suggested_subcategory, importance, urgency, action_required, system_tags, user_tags, "
    "confidence, needs_more_context, review_required and a short optional reason."
)

_THREAD_SUMMARY_SYSTEM = (
    "Maintain one compact email-thread summary. Use ONLY the existing summary and the new current "
    "message. Never reconstruct or request full thread history. Return ONLY JSON with: changed "
    "(boolean), summary (string), open_action_required (boolean), deadline (string or null). "
    "The summary must capture current topic, status, open points, who needs to act, and any "
    "deadline. Set changed=false when the new message adds no relevant thread information; in "
    "that case keep the existing summary unchanged. Keep the summary concise."
)

_DRAFT_SYSTEM = (
    "You are a professional email drafting assistant. "
    "Write a reply in the same language as the original email. "
    "Return only the body text — no subject line, no headers, no signature placeholder."
)


@dataclass(frozen=True)
class ModelPathConfig:
    model_id: str
    api_base: str | None
    api_key: str | None
    timeout: float
    max_retries: int


@dataclass
class LLMConfig:
    # Compatibility/default path. Existing callers only need these fields.
    model_id: str
    api_base: str | None = None
    api_key: str | None = None
    timeout: float = 30.0
    max_retries: int = 2
    review_confidence_threshold: float = 0.60

    # Optional role-specific classification paths. Missing values fall back to
    # the compatibility path so old single-model installations keep working.
    fast_model_id: str | None = None
    fast_api_base: str | None = None
    fast_api_key: str | None = None
    deep_model_id: str | None = None
    deep_api_base: str | None = None
    deep_api_key: str | None = None
    stage_roles: tuple[ModelRole, ModelRole, ModelRole, ModelRole] = (
        "fast",
        "fast",
        "deep",
        "deep",
    )
    thread_summary_role: ModelRole = "fast"
    path_failure_threshold: int = 3
    path_reset_timeout: float = 60.0

    def __post_init__(self) -> None:
        if self.path_failure_threshold <= 0:
            raise ValueError("path_failure_threshold must be positive")
        if self.path_reset_timeout <= 0:
            raise ValueError("path_reset_timeout must be positive")
        if len(self.stage_roles) != 4 or any(
            role not in {"fast", "deep"} for role in self.stage_roles
        ):
            raise ValueError("stage_roles must contain four fast/deep values")
        if self.thread_summary_role not in {"fast", "deep"}:
            raise ValueError("thread_summary_role must be fast or deep")


class LLMClient:
    """LiteLLM client with independent fast/deep classification paths."""

    def __init__(self, config: LLMConfig) -> None:
        self._config = config
        self._path_failures: dict[ModelRole, int] = {"fast": 0, "deep": 0}
        self._path_opened_at: dict[ModelRole, float | None] = {
            "fast": None,
            "deep": None,
        }

    def _default_path(self) -> ModelPathConfig:
        return ModelPathConfig(
            model_id=self._config.model_id,
            api_base=self._config.api_base,
            api_key=self._config.api_key,
            timeout=self._config.timeout,
            max_retries=self._config.max_retries,
        )

    def _classification_path(self, role: ModelRole) -> ModelPathConfig:
        default = self._default_path()
        if role == "fast":
            return ModelPathConfig(
                model_id=self._config.fast_model_id or default.model_id,
                api_base=self._config.fast_api_base or default.api_base,
                api_key=self._config.fast_api_key or default.api_key,
                timeout=default.timeout,
                max_retries=default.max_retries,
            )
        return ModelPathConfig(
            model_id=self._config.deep_model_id or default.model_id,
            api_base=self._config.deep_api_base or default.api_base,
            api_key=self._config.deep_api_key or default.api_key,
            timeout=default.timeout,
            max_retries=default.max_retries,
        )

    def _path_is_open(self, role: ModelRole) -> bool:
        opened_at = self._path_opened_at[role]
        if opened_at is None:
            return False
        if time.monotonic() - opened_at >= self._config.path_reset_timeout:
            self._path_opened_at[role] = None
            self._path_failures[role] = 0
            return False
        return True

    def _call_path(self, messages: list[dict], path: ModelPathConfig) -> str:
        kwargs: dict = {
            "model": path.model_id,
            "messages": messages,
            "timeout": path.timeout,
            "num_retries": path.max_retries,
        }
        if path.api_base:
            kwargs["api_base"] = path.api_base
        if path.api_key:
            kwargs["api_key"] = path.api_key
        try:
            response = litellm.completion(**kwargs)
            return response.choices[0].message.content or ""
        except Exception as exc:
            raise LLMError(str(exc)) from exc

    def _call_default(self, messages: list[dict]) -> str:
        return self._call_path(messages, self._default_path())

    def _call_classification(
        self,
        messages: list[dict],
        primary_role: ModelRole,
    ) -> tuple[str, str, ModelRole]:
        """Call one classification role and fall back only to the other role."""
        roles: tuple[ModelRole, ModelRole] = (
            primary_role,
            "deep" if primary_role == "fast" else "fast",
        )
        first_error: Exception | None = None
        primary_path = self._classification_path(primary_role)

        for index, role in enumerate(roles):
            path = self._classification_path(role)
            if index == 1 and path == primary_path:
                break
            if self._path_is_open(role):
                error = LLMError(f"classification path {role} circuit is open")
                if first_error is None:
                    first_error = error
                continue
            try:
                raw = self._call_path(messages, path)
            except Exception as exc:
                self._path_failures[role] += 1
                if self._path_failures[role] >= self._config.path_failure_threshold:
                    self._path_opened_at[role] = time.monotonic()
                if first_error is None:
                    first_error = exc
                continue
            self._path_failures[role] = 0
            self._path_opened_at[role] = None
            return raw, path.model_id, role

        if first_error is not None:
            raise first_error
        raise LLMError("no classification model path is available")

    def _role_for_stage(self, stage: int | None) -> ModelRole:
        if stage is None:
            return self._config.stage_roles[0]
        if stage not in {0, 1, 2, 3}:
            raise ValueError("classification stage must be 0, 1, 2, 3 or None")
        return self._config.stage_roles[stage]

    def classify(
        self,
        email: ParsedEmail,
        available_labels: list[str] | None = None,
        available_categories: list[str] | None = None,
        thread_summary: str | None = None,
        supporting_signal: ClassificationResult | None = None,
        previous_result: ClassificationResult | None = None,
        classification_stage: int | None = None,
    ) -> ClassificationResult:
        """Classify one stage using the configured fast/deep model mapping."""
        categories = available_categories or list(CONFIRMED_CATEGORIES)
        invalid_categories = set(categories) - set(CONFIRMED_CATEGORIES)
        if invalid_categories:
            raise ClassificationError(
                f"Unsupported confirmed categories: {sorted(invalid_categories)}"
            )

        role = self._role_for_stage(classification_stage)
        sections = [f"Confirmed categories: {', '.join(categories)}"]
        if classification_stage is not None:
            sections.append(f"Classification stage: {classification_stage}")
        sections.append(f"Requested model role: {role}")
        if thread_summary:
            sections.append(f"Thread context (context only):\n{thread_summary[:1500]}")
        if supporting_signal is not None:
            sections.append(
                "Deterministic supporting signal: "
                f"label={supporting_signal.label}; "
                f"confidence={supporting_signal.confidence:.2f}; "
                f"method={supporting_signal.method}"
            )
        if previous_result is not None:
            sections.append(
                "Previous stage result (revise if new content changes it): "
                f"category={previous_result.category}; "
                f"confidence={previous_result.confidence:.2f}; "
                f"needs_more_context={previous_result.needs_more_context}; "
                f"review_required={previous_result.review_required}"
            )

        headers = (
            f"From: {email.from_email}\n"
            f"Subject: {email.subject_normalized}\n"
            f"Date: {email.date or ''}\n"
            f"Reply-To: {email.reply_to or ''}\n"
            f"List-ID: {email.list_id or ''}\n"
            f"Precedence: {email.precedence or ''}\n"
            f"Message-ID: {email.message_id or ''}\n"
            f"In-Reply-To: {email.in_reply_to or ''}\n"
            f"References: {' '.join(email.references)}"
        )
        sections.append(f"Current message headers:\n{headers}")
        if email.body_text:
            sections.append(f"Cleaned current body:\n{email.body_text}")
        if role == "deep":
            sections.append(
                "When enough thread context is available, also include "
                "thread_summary_update={changed, summary, open_action_required, deadline} "
                "so no second summary call is needed."
            )
        user_msg = "\n\n".join(sections)

        messages = [
            {"role": "system", "content": _CLASSIFY_SYSTEM},
            {"role": "user", "content": user_msg},
        ]
        raw, model_used, _actual_role = self._call_classification(messages, role)
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
        needs_more_context = _strict_bool(data.get("needs_more_context", False))
        review_required = _strict_bool(data.get("review_required", False)) or (
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
                classification_stage=classification_stage,
                classification_model=model_used,
                thread_summary_update=_optional_thread_summary_update(
                    data.get("thread_summary_update")
                ),
            )
        except (TypeError, ValueError) as exc:
            raise ClassificationError(f"Invalid LLM response: {raw!r}") from exc

        if result.review_required and result.reason is None:
            result = replace(
                result,
                reason=(
                    "more context required"
                    if result.needs_more_context
                    else "classification requires review"
                ),
            )
        return result

    def update_thread_summary(
        self,
        previous_summary: str,
        email: ParsedEmail,
        classification: ClassificationResult,
    ) -> ThreadSummaryUpdate:
        if classification.thread_summary_update is not None:
            return classification.thread_summary_update

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
        raw, _model_used, _role = self._call_classification(
            [
                {"role": "system", "content": _THREAD_SUMMARY_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            self._config.thread_summary_role,
        )
        try:
            data = json.loads(raw)
            changed = _strict_bool(data["changed"])
            summary = str(data["summary"]).strip()
            open_action_required = _strict_bool(data["open_action_required"])
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            raise ClassificationError(f"Invalid thread summary response: {raw!r}") from exc

        if not changed:
            summary = previous_summary
        if not summary:
            summary = previous_summary or email.subject_normalized[:500]
        return ThreadSummaryUpdate(
            summary=summary[:2000],
            changed=changed,
            open_action_required=open_action_required,
            deadline=_optional_text(data.get("deadline")),
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
        return self._call_default(
            [
                {"role": "system", "content": _DRAFT_SYSTEM},
                {"role": "user", "content": user_msg},
            ]
        )


def _strict_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if value in (0, 1):
        return bool(value)
    raise ValueError("expected boolean value")


def _optional_thread_summary_update(value: object) -> ThreadSummaryUpdate | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("thread_summary_update must be an object")
    summary = str(value.get("summary", "")).strip()
    if not summary:
        return None
    return ThreadSummaryUpdate(
        summary=summary[:2000],
        changed=_strict_bool(value.get("changed", True)),
        open_action_required=_strict_bool(value.get("open_action_required", False)),
        deadline=_optional_text(value.get("deadline")),
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
