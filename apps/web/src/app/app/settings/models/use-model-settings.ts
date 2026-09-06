"use client";

import { ApiError, api } from "@/lib/api";
import type { LLMProvider } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";

export type ModelFormState = {
  fastModel: string;
  deepModel: string;
  generationModel: string;
  fastBaseUrl: string;
  deepBaseUrl: string;
  generationBaseUrl: string;
  fastApiKey: string;
  deepApiKey: string;
  generationApiKey: string;
};

export function useModelSettings() {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [providerId, setProviderId] = useState("");
  const [form, setForm] = useState<ModelFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const provider = useMemo(
    () => providers.find((item) => item.id === providerId) ?? null,
    [providerId, providers],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await api.listProviders();
      setProviders(items);
      if (items.length > 0) selectInitialProvider(items, setProviderId, setForm);
    } catch (err) {
      setError(messageOf(err, "model_settings_load_failed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function selectProvider(id: string) {
    setProviderId(id);
    const selected = providers.find((item) => item.id === id);
    if (selected) setForm(formFor(selected));
    setError(null);
    setNotice(null);
  }

  async function save() {
    if (!provider) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.updateProvider(provider.id, providerUpdate(form));
      setProviders((current) => current.map((item) => item.id === updated.id ? updated : item));
      setForm(formFor(updated));
      setNotice("saved");
    } catch (err) {
      setError(messageOf(err, "model_settings_save_failed"));
    } finally {
      setBusy(false);
    }
  }

  return { providers, providerId, provider, form, setForm, loading, error, notice, busy, reload: load, selectProvider, save };
}

export type ModelSettingsController = ReturnType<typeof useModelSettings>;

const emptyForm: ModelFormState = {
  fastModel: "", deepModel: "", generationModel: "",
  fastBaseUrl: "", deepBaseUrl: "", generationBaseUrl: "",
  fastApiKey: "", deepApiKey: "", generationApiKey: "",
};

function formFor(provider: LLMProvider): ModelFormState {
  return {
    fastModel: provider.fast_classification_model ?? provider.default_classification_model,
    deepModel: provider.deep_classification_model ?? provider.default_classification_model,
    generationModel: provider.generation_model ?? provider.default_generation_model,
    fastBaseUrl: provider.fast_classification_base_url ?? "",
    deepBaseUrl: provider.deep_classification_base_url ?? "",
    generationBaseUrl: provider.generation_base_url ?? "",
    fastApiKey: "", deepApiKey: "", generationApiKey: "",
  };
}

function selectInitialProvider(items: LLMProvider[], setId: (value: string) => void, setForm: (value: ModelFormState) => void) {
  setId(items[0].id);
  setForm(formFor(items[0]));
}

function providerUpdate(form: ModelFormState) {
  return {
    fast_classification_model: form.fastModel || null,
    deep_classification_model: form.deepModel || null,
    generation_model: form.generationModel || null,
    fast_classification_base_url: form.fastBaseUrl || null,
    deep_classification_base_url: form.deepBaseUrl || null,
    generation_base_url: form.generationBaseUrl || null,
    ...(form.fastApiKey ? { fast_api_key: form.fastApiKey } : {}),
    ...(form.deepApiKey ? { deep_api_key: form.deepApiKey } : {}),
    ...(form.generationApiKey ? { generation_api_key: form.generationApiKey } : {}),
  };
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}
