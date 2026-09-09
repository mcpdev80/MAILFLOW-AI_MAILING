from app.models.llm_provider import LLMProvider


def test_llm_provider_supports_external_secret_references() -> None:
    provider = LLMProvider(
        label="external-secret-provider",
        type="openai-compatible",
        base_url="https://provider.invalid/v1",
        encrypted_api_key=None,
        api_key_secret_ref="dyn-test-ref",
        default_classification_model="fast-model",
        default_generation_model="generation-model",
        fast_api_key_secret_ref="dyn-fast-ref",
        deep_api_key_secret_ref="dyn-deep-ref",
        generation_api_key_secret_ref="dyn-generation-ref",
    )

    assert provider.encrypted_api_key is None
    assert provider.api_key_secret_ref == "dyn-test-ref"
    assert provider.fast_api_key_secret_ref == "dyn-fast-ref"
    assert provider.deep_api_key_secret_ref == "dyn-deep-ref"
    assert provider.generation_api_key_secret_ref == "dyn-generation-ref"
