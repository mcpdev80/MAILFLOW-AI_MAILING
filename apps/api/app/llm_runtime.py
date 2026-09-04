"""Shared construction helpers for resilient LLM runtime clients."""

from __future__ import annotations

from typing import cast

from mailflow_core.classification.llm_client import LLMClient, LLMConfig, ModelRole

from app.config import settings
from app.crypto import decrypt_secret
from app.models.llm_provider import LLMProvider
from app.scheduled_llm import ScheduledLLMClient
from app.workload import PRIORITY_LIVE, get_workload_controller


def _optional_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def _provider_string(provider: object, field: str) -> str | None:
    return _optional_string(getattr(provider, field, None))


def _decrypt_llm_key(value: object) -> str | None:
    encrypted = _optional_string(value)
    if not encrypted:
        return None
    return str(decrypt_secret(encrypted)["api_key"])


def _model_role(value: str) -> ModelRole:
    return cast(ModelRole, value)


def _scheduled(config: LLMConfig, account_id: object, priority: int) -> LLMClient:
    return ScheduledLLMClient(
        config,
        controller=get_workload_controller(),
        account_id=str(account_id) if account_id is not None else None,
        priority=priority,
    )


def build_llm_client(
    llm_provider: LLMProvider | None,
    *,
    for_generation: bool,
    account_id: object = None,
    priority: int = PRIORITY_LIVE,
) -> LLMClient | None:
    """Build a role-aware client with resilience and global workload control."""
    if llm_provider is None or not llm_provider.is_active:
        return None

    shared_api_key = _decrypt_llm_key(llm_provider.encrypted_api_key)
    common = {
        "path_failure_threshold": settings.LLM_CIRCUIT_FAILURE_THRESHOLD,
        "path_reset_timeout": settings.LLM_CIRCUIT_RESET_SECONDS,
    }

    if for_generation:
        return _scheduled(
            LLMConfig(
                model_id=(
                    _provider_string(llm_provider, "generation_model")
                    or llm_provider.default_generation_model
                ),
                api_base=(
                    _provider_string(llm_provider, "generation_base_url")
                    or llm_provider.base_url
                ),
                api_key=(
                    _decrypt_llm_key(
                        getattr(llm_provider, "encrypted_generation_api_key", None)
                    )
                    or shared_api_key
                ),
                generation_timeout=settings.LLM_GENERATION_TIMEOUT_SECONDS,
                generation_max_retries=settings.LLM_GENERATION_MAX_RETRIES,
                **common,
            ),
            account_id,
            priority,
        )

    return _scheduled(
        LLMConfig(
            model_id=llm_provider.default_classification_model,
            api_base=llm_provider.base_url,
            api_key=shared_api_key,
            fast_model_id=_provider_string(llm_provider, "fast_classification_model"),
            fast_api_base=_provider_string(
                llm_provider, "fast_classification_base_url"
            ),
            fast_api_key=(
                _decrypt_llm_key(getattr(llm_provider, "encrypted_fast_api_key", None))
                or shared_api_key
            ),
            fast_timeout=settings.LLM_FAST_TIMEOUT_SECONDS,
            fast_max_retries=settings.LLM_FAST_MAX_RETRIES,
            deep_model_id=_provider_string(llm_provider, "deep_classification_model"),
            deep_api_base=_provider_string(
                llm_provider, "deep_classification_base_url"
            ),
            deep_api_key=(
                _decrypt_llm_key(getattr(llm_provider, "encrypted_deep_api_key", None))
                or shared_api_key
            ),
            deep_timeout=settings.LLM_DEEP_TIMEOUT_SECONDS,
            deep_max_retries=settings.LLM_DEEP_MAX_RETRIES,
            stage_roles=(
                _model_role(settings.CLASSIFICATION_STAGE_0_ROLE),
                _model_role(settings.CLASSIFICATION_STAGE_1_ROLE),
                _model_role(settings.CLASSIFICATION_STAGE_2_ROLE),
                _model_role(settings.CLASSIFICATION_STAGE_3_ROLE),
            ),
            thread_summary_role=_model_role(settings.THREAD_SUMMARY_MODEL_ROLE),
            **common,
        ),
        account_id,
        priority,
    )
