"use client";

import { ApiError, api } from "@/lib/api";
import type {
  LLMProvider,
  LLMRole,
  LLMRoleAssignment,
  LLMRoleAssignments,
} from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";

export type SourceDraft = {
  label: string;
  type: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};
export type RoleDraft = Record<
  LLMRole,
  { providerId: string; modelId: string }
>;

const providerDefaults: Record<string, string> = {
  "openai-compatible": "http://localhost:8000/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434",
};

export const providerTypes = Object.keys(providerDefaults);

export function useModelSettings() {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [assignments, setAssignments] = useState<LLMRoleAssignments>({
    fast: null,
    deep: null,
    generation: null,
  });
  const [roles, setRoles] = useState<RoleDraft>({
    fast: { providerId: "", modelId: "" },
    deep: { providerId: "", modelId: "" },
    generation: { providerId: "", modelId: "" },
  });
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [sourceDraft, setSourceDraft] = useState<SourceDraft>({
    label: "",
    type: "openai-compatible",
    baseUrl: providerDefaults["openai-compatible"],
    apiKey: "",
    model: "",
  });
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeProviders = useMemo(
    () => providers.filter((item) => item.is_active),
    [providers],
  );

  const syncRoles = useCallback(
    (items: LLMProvider[], value: LLMRoleAssignments) => {
      const fallback = items.find((item) => item.is_active) ?? items[0];
      const next = {
        fast: roleValue("fast", value.fast, fallback),
        deep: roleValue("deep", value.deep, fallback),
        generation: roleValue("generation", value.generation, fallback),
      };
      setRoles(next);
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [items, roleValues] = await Promise.all([
        api.listProviders(),
        api.getLLMRoleAssignments(),
      ]);
      setProviders(items);
      setAssignments(roleValues);
      syncRoles(items, roleValues);
    } catch (err) {
      setError(messageOf(err, "model_settings_load_failed"));
    } finally {
      setLoading(false);
    }
  }, [syncRoles]);

  useEffect(() => {
    void load();
  }, [load]);

  function setSourceType(type: string) {
    setSourceDraft((current) => ({
      ...current,
      type,
      baseUrl: providerDefaults[type] ?? current.baseUrl,
    }));
  }

  async function discoverDraftModels() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.discoverProviderModels({
        type: sourceDraft.type,
        base_url: sourceDraft.baseUrl,
        api_key: sourceDraft.apiKey || null,
      });
      setModels((current) => ({ ...current, draft: result.models }));
      if (!sourceDraft.model && result.models[0])
        setSourceDraft((current) => ({ ...current, model: result.models[0] }));
      setNotice("models");
    } catch (err) {
      setError(messageOf(err, "model_discovery_failed"));
    } finally {
      setBusy(false);
    }
  }

  async function addSource() {
    if (
      !sourceDraft.label.trim() ||
      !sourceDraft.baseUrl.trim() ||
      !sourceDraft.model.trim()
    ) {
      setError("source_fields_required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createProvider({
        label: sourceDraft.label.trim(),
        type: sourceDraft.type,
        base_url: sourceDraft.baseUrl.trim(),
        api_key: sourceDraft.apiKey || null,
        default_classification_model: sourceDraft.model.trim(),
        default_generation_model: sourceDraft.model.trim(),
      });
      setShowAdd(false);
      setSourceDraft({
        label: "",
        type: "openai-compatible",
        baseUrl: providerDefaults["openai-compatible"],
        apiKey: "",
        model: "",
      });
      setModels(({ draft: _draft, ...current }) => current);
      await load();
      setNotice("created");
    } catch (err) {
      setError(messageOf(err, "model_settings_save_failed"));
    } finally {
      setBusy(false);
    }
  }

  async function discoverSource(id: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.listProviderModels(id);
      setModels((current) => ({ ...current, [id]: result.models }));
      setNotice("models");
    } catch (err) {
      setError(messageOf(err, "model_discovery_failed"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleSource(provider: LLMProvider) {
    setBusy(true);
    setError(null);
    try {
      await api.updateProvider(provider.id, { is_active: !provider.is_active });
      await load();
    } catch (err) {
      setError(messageOf(err, "model_settings_save_failed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeSource(provider: LLMProvider) {
    setBusy(true);
    setError(null);
    try {
      await api.deleteProvider(provider.id);
      await load();
      setNotice("deleted");
    } catch (err) {
      setError(messageOf(err, "model_settings_save_failed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveSource(
    provider: LLMProvider,
    values: { label: string; baseUrl: string; apiKey: string },
  ) {
    setBusy(true);
    setError(null);
    try {
      await api.updateProvider(provider.id, {
        label: values.label,
        base_url: values.baseUrl,
        ...(values.apiKey ? { api_key: values.apiKey } : {}),
      });
      setEditingId(null);
      await load();
      setNotice("saved");
    } catch (err) {
      setError(messageOf(err, "model_settings_save_failed"));
    } finally {
      setBusy(false);
    }
  }

  async function setRoleProvider(role: LLMRole, providerId: string) {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) return;
    if (!models[providerId]) await discoverSource(providerId);
    const known = models[providerId] ?? [];
    const fallbackModel =
      role === "generation"
        ? (provider.generation_model ?? provider.default_generation_model)
        : role === "deep"
          ? (provider.deep_classification_model ??
            provider.default_classification_model)
          : (provider.fast_classification_model ??
            provider.default_classification_model);
    setRoles((current) => ({
      ...current,
      [role]: { providerId, modelId: known[0] ?? fallbackModel },
    }));
  }

  function setRoleModel(role: LLMRole, modelId: string) {
    setRoles((current) => ({
      ...current,
      [role]: { ...current[role], modelId },
    }));
  }

  async function saveRoles() {
    const payload: Record<string, LLMRoleAssignment> = {};
    for (const role of ["fast", "deep", "generation"] as const) {
      const value = roles[role];
      if (!value.providerId || !value.modelId) {
        setError("role_fields_required");
        return;
      }
      payload[role] = {
        role,
        provider_id: value.providerId,
        model_id: value.modelId,
      };
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateLLMRoleAssignments(payload);
      setAssignments(updated);
      syncRoles(providers, updated);
      setNotice("roles");
    } catch (err) {
      setError(messageOf(err, "model_settings_save_failed"));
    } finally {
      setBusy(false);
    }
  }

  return {
    providers,
    activeProviders,
    assignments,
    roles,
    models,
    sourceDraft,
    setSourceDraft,
    setSourceType,
    showAdd,
    setShowAdd,
    editingId,
    setEditingId,
    loading,
    busy,
    error,
    notice,
    reload: load,
    discoverDraftModels,
    addSource,
    discoverSource,
    toggleSource,
    removeSource,
    saveSource,
    setRoleProvider,
    setRoleModel,
    saveRoles,
  };
}

function roleValue(
  role: LLMRole,
  assignment: LLMRoleAssignment | null,
  fallback?: LLMProvider,
) {
  if (assignment)
    return { providerId: assignment.provider_id, modelId: assignment.model_id };
  if (!fallback) return { providerId: "", modelId: "" };
  const modelId =
    role === "generation"
      ? (fallback.generation_model ?? fallback.default_generation_model)
      : role === "deep"
        ? (fallback.deep_classification_model ??
          fallback.default_classification_model)
        : (fallback.fast_classification_model ??
          fallback.default_classification_model);
  return { providerId: fallback.id, modelId };
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : fallback;
}

export type ModelSettingsController = ReturnType<typeof useModelSettings>;
