"""LLMClient variant that admits every model request through the global scheduler."""

from __future__ import annotations

import os
from collections.abc import Callable
from typing import TypeVar

import mailflow_core.classification.llm_client as llm_module
from mailflow_core.classification.llm_client import LLMClient, LLMConfig, ModelRole
from mailflow_core.exceptions import LLMError
from mailflow_core.resilience import CircuitOpenError

from app.workload import RedisWorkloadController

T = TypeVar("T")

_LANGUAGE_NAMES = {
    "de": "German",
    "en": "English",
    "es": "Spanish",
}


def _human_language_instruction(output_locale: str | None) -> str:
    configured = (
        (output_locale or "").strip().lower()
        or os.getenv("MAILFLOW_AI_LANGUAGE", "").strip().lower()
        or os.getenv("MAILFLOW_BOOTSTRAP_LANGUAGE", "").strip().lower()
    )
    language = _LANGUAGE_NAMES.get(configured)
    if language:
        return (
            f"Write all human-facing explanatory text, especially the `reason` field, in {language}. "
            "Keep category, importance, urgency, action_required, tag and other machine-readable "
            "enum values exactly as required by the JSON contract."
        )
    return (
        "Write all human-facing explanatory text, especially the `reason` field, in the natural "
        "language of the current email. Keep category, importance, urgency, action_required, tag "
        "and other machine-readable enum values exactly as required by the JSON contract."
    )


class ScheduledLLMClient(LLMClient):
    """Preserve core resilience semantics while adding distributed admission control."""

    def __init__(
        self,
        config: LLMConfig,
        *,
        controller: RedisWorkloadController,
        account_id: str | None,
        priority: int,
        output_locale: str | None = None,
    ) -> None:
        super().__init__(config)
        self._workload_controller = controller
        self._workload_account_id = account_id
        self._workload_priority = priority
        self._output_locale = output_locale

    def _scheduled_call_path(self, messages: list[dict], path, role: str) -> str:
        with self._workload_controller.acquire(
            role=role,
            model_id=path.model_id,
            api_base=path.api_base,
            account_id=self._workload_account_id,
            priority=self._workload_priority,
        ):
            return super()._call_path(messages, path)

    def _call_default(self, messages: list[dict]) -> str:
        path = self._default_path()
        breaker = self._breaker(path, "generation")
        if breaker.state == "open":
            raise CircuitOpenError("generation model circuit is open")
        try:
            raw = self._scheduled_call_path(messages, path, "generation")
        except Exception as exc:
            breaker.record_failure(exc)
            raise
        breaker.record_success()
        return raw

    def _call_classification(
        self,
        messages: list[dict],
        primary_role: ModelRole,
        parser: Callable[[str, str], T],
    ) -> tuple[T, ModelRole]:
        localized_messages = [dict(message) for message in messages]
        instruction = _human_language_instruction(self._output_locale)
        if localized_messages and localized_messages[0].get("role") == "system":
            localized_messages[0]["content"] = (
                f"{localized_messages[0].get('content', '')}\n\n{instruction}"
            )
        else:
            localized_messages.insert(
                0,
                {"role": "system", "content": instruction},
            )

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
            breaker = self._breaker(path, role)
            if breaker.state == "open":
                error = CircuitOpenError(f"classification path {role} circuit is open")
                if first_error is None:
                    first_error = error
                continue
            try:
                raw = self._scheduled_call_path(localized_messages, path, role)
                parsed = parser(raw, path.model_id)
            except Exception as exc:
                breaker.record_failure(exc)
                if first_error is None:
                    first_error = exc
                continue
            breaker.record_success()
            if index == 1:
                key = path.health_key(role)
                llm_module._FALLBACK_COUNTS[key] = (
                    llm_module._FALLBACK_COUNTS.get(key, 0) + 1
                )
            return parsed, role
        if first_error is not None:
            raise first_error
        raise LLMError("no classification model path is available")
