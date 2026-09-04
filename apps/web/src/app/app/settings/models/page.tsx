"use client";

import { ApiError, api } from "@/lib/api";
import type { LLMProvider } from "@/lib/types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type FormState = {
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

const emptyForm: FormState = {
  fastModel: "",
  deepModel: "",
  generationModel: "",
  fastBaseUrl: "",
  deepBaseUrl: "",
  generationBaseUrl: "",
  fastApiKey: "",
  deepApiKey: "",
  generationApiKey: "",
};

function formFor(provider: LLMProvider): FormState {
  return {
    fastModel:
      provider.fast_classification_model ?? provider.default_classification_model,
    deepModel:
      provider.deep_classification_model ?? provider.default_classification_model,
    generationModel:
      provider.generation_model ?? provider.default_generation_model,
    fastBaseUrl: provider.fast_classification_base_url ?? "",
    deepBaseUrl: provider.deep_classification_base_url ?? "",
    generationBaseUrl: provider.generation_base_url ?? "",
    fastApiKey: "",
    deepApiKey: "",
    generationApiKey: "",
  };
}

export default function ModelSettingsPage() {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [providerId, setProviderId] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const provider = useMemo(
    () => providers.find((item) => item.id === providerId) ?? null,
    [providerId, providers],
  );

  useEffect(() => {
    api
      .listProviders()
      .then((items) => {
        setProviders(items);
        if (items.length > 0) {
          setProviderId(items[0].id);
          setForm(formFor(items[0]));
        }
      })
      .catch((err) => {
        setError(
          err instanceof ApiError ? err.message : "Could not load LLM providers",
        );
      });
  }, []);

  function selectProvider(id: string) {
    setProviderId(id);
    const selected = providers.find((item) => item.id === id);
    if (selected) setForm(formFor(selected));
    setError(null);
    setNotice(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!provider) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.updateProvider(provider.id, {
        fast_classification_model: form.fastModel || null,
        deep_classification_model: form.deepModel || null,
        generation_model: form.generationModel || null,
        fast_classification_base_url: form.fastBaseUrl || null,
        deep_classification_base_url: form.deepBaseUrl || null,
        generation_base_url: form.generationBaseUrl || null,
        ...(form.fastApiKey ? { fast_api_key: form.fastApiKey } : {}),
        ...(form.deepApiKey ? { deep_api_key: form.deepApiKey } : {}),
        ...(form.generationApiKey
          ? { generation_api_key: form.generationApiKey }
          : {}),
      });
      setProviders((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setForm(formFor(updated));
      setNotice("Model roles updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save model roles");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <p>
        <Link href="/app/dashboard">← Dashboard</Link>
      </p>
      <h1>Model roles</h1>
      <p className="muted">
        Stage 0/1 use the fast role by default; Stage 2/3 use the deep role.
        Role-specific endpoints are optional and fall back to the provider base URL.
      </p>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      {providers.length === 0 ? (
        <div className="card">
          <p>No LLM provider is configured yet.</p>
          <Link className="btn" href="/onboarding">
            Configure provider
          </Link>
        </div>
      ) : (
        <form className="card" onSubmit={save}>
          <div className="field">
            <label htmlFor="provider">Provider profile</label>
            <select
              id="provider"
              value={providerId}
              onChange={(event) => selectProvider(event.target.value)}
            >
              {providers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <h3>Fast classification</h3>
          <div className="row">
            <div className="field">
              <label htmlFor="fast-model">Model</label>
              <input
                id="fast-model"
                value={form.fastModel}
                onChange={(event) =>
                  setForm({ ...form, fastModel: event.target.value })
                }
                placeholder={provider?.default_classification_model}
              />
            </div>
            <div className="field">
              <label htmlFor="fast-url">Endpoint override</label>
              <input
                id="fast-url"
                value={form.fastBaseUrl}
                onChange={(event) =>
                  setForm({ ...form, fastBaseUrl: event.target.value })
                }
                placeholder={provider?.base_url}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="fast-key">API key override</label>
            <input
              id="fast-key"
              type="password"
              value={form.fastApiKey}
              onChange={(event) =>
                setForm({ ...form, fastApiKey: event.target.value })
              }
              placeholder={provider?.has_fast_api_key ? "Configured" : "Use shared key"}
            />
          </div>

          <h3>Deep classification</h3>
          <div className="row">
            <div className="field">
              <label htmlFor="deep-model">Model</label>
              <input
                id="deep-model"
                value={form.deepModel}
                onChange={(event) =>
                  setForm({ ...form, deepModel: event.target.value })
                }
                placeholder={provider?.default_classification_model}
              />
            </div>
            <div className="field">
              <label htmlFor="deep-url">Endpoint override</label>
              <input
                id="deep-url"
                value={form.deepBaseUrl}
                onChange={(event) =>
                  setForm({ ...form, deepBaseUrl: event.target.value })
                }
                placeholder={provider?.base_url}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="deep-key">API key override</label>
            <input
              id="deep-key"
              type="password"
              value={form.deepApiKey}
              onChange={(event) =>
                setForm({ ...form, deepApiKey: event.target.value })
              }
              placeholder={provider?.has_deep_api_key ? "Configured" : "Use shared key"}
            />
          </div>

          <h3>Generation</h3>
          <div className="row">
            <div className="field">
              <label htmlFor="generation-model">Model</label>
              <input
                id="generation-model"
                value={form.generationModel}
                onChange={(event) =>
                  setForm({ ...form, generationModel: event.target.value })
                }
                placeholder={provider?.default_generation_model}
              />
            </div>
            <div className="field">
              <label htmlFor="generation-url">Endpoint override</label>
              <input
                id="generation-url"
                value={form.generationBaseUrl}
                onChange={(event) =>
                  setForm({ ...form, generationBaseUrl: event.target.value })
                }
                placeholder={provider?.base_url}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="generation-key">API key override</label>
            <input
              id="generation-key"
              type="password"
              value={form.generationApiKey}
              onChange={(event) =>
                setForm({ ...form, generationApiKey: event.target.value })
              }
              placeholder={
                provider?.has_generation_api_key ? "Configured" : "Use shared key"
              }
            />
          </div>

          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save model roles"}
          </button>
        </form>
      )}
    </main>
  );
}
