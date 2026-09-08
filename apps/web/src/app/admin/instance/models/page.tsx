"use client";

import { useI18n } from "@/lib/i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "../../admin-pages.module.css";

type Provider = {
  id: string;
  label: string;
  type: string;
  base_url: string;
  has_api_key: boolean;
  is_active: boolean;
};

type Model = {
  id: string;
  provider_id: string;
  model_id: string;
  is_enabled: boolean;
  organization_ids: string[];
};

type Organization = { id: string; name: string; slug: string };

type Catalog = {
  providers: Provider[];
  models: Model[];
  organizations: Organization[];
  pricing: { enabled: boolean; implemented: boolean };
};

const PROVIDER_DEFAULTS: Record<string, string> = {
  "openai-compatible": "http://localhost:8000/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434",
};

const COPY = {
  de: {
    title: "KI & Modelle",
    description:
      "Anbieter, Endpunkte und Zugangsdaten werden zentral für die gesamte Instanz verwaltet. Organisationen sehen nur die Modelle, die du hier freigibst.",
    add: "KI-Anbieter hinzufügen",
    label: "Name",
    type: "Anbieter",
    endpoint: "Base URL",
    apiKey: "API-Schlüssel",
    seed: "Startmodell (optional)",
    create: "Anbieter anlegen",
    providers: "Anbieter",
    models: "Modelle & Freigaben",
    discover: "Modelle erkennen",
    active: "Aktiv",
    inactive: "Deaktiviert",
    enable: "Aktivieren",
    disable: "Deaktivieren",
    delete: "Löschen",
    secretSet: "API-Schlüssel hinterlegt",
    secretNone: "Kein API-Schlüssel",
    modelEnabled: "Modell aktiv",
    organizations: "Freigegeben für",
    none: "Keine Organisation",
    loading: "KI-Konfiguration wird geladen …",
    emptyProviders: "Noch keine Anbieter vorhanden.",
    emptyModels: "Noch keine Modelle erkannt. Starte die Modellerkennung beim Anbieter.",
    pricingFuture:
      "Kosteninformationen sind derzeit deaktiviert. Die Modellstruktur ist so getrennt, dass optionale Preise später ohne Änderung der Rollen- oder Providerlogik ergänzt werden können.",
  },
  en: {
    title: "AI & Models",
    description:
      "Providers, endpoints and credentials are managed centrally for the whole instance. Organizations only see models you approve here.",
    add: "Add AI provider",
    label: "Name",
    type: "Provider",
    endpoint: "Base URL",
    apiKey: "API key",
    seed: "Seed model (optional)",
    create: "Create provider",
    providers: "Providers",
    models: "Models & access",
    discover: "Discover models",
    active: "Active",
    inactive: "Disabled",
    enable: "Enable",
    disable: "Disable",
    delete: "Delete",
    secretSet: "API key configured",
    secretNone: "No API key",
    modelEnabled: "Model enabled",
    organizations: "Available to",
    none: "No organization",
    loading: "Loading AI configuration …",
    emptyProviders: "No providers yet.",
    emptyModels: "No models discovered yet. Run model discovery on a provider.",
    pricingFuture:
      "Cost information is currently disabled. The model catalog is separated so optional pricing can be added later without changing provider or role logic.",
  },
  es: {
    title: "IA y modelos",
    description:
      "Los proveedores, endpoints y credenciales se gestionan de forma central para toda la instancia. Las organizaciones solo ven los modelos aprobados aquí.",
    add: "Añadir proveedor de IA",
    label: "Nombre",
    type: "Proveedor",
    endpoint: "Base URL",
    apiKey: "Clave API",
    seed: "Modelo inicial (opcional)",
    create: "Crear proveedor",
    providers: "Proveedores",
    models: "Modelos y accesos",
    discover: "Detectar modelos",
    active: "Activo",
    inactive: "Desactivado",
    enable: "Activar",
    disable: "Desactivar",
    delete: "Eliminar",
    secretSet: "Clave API configurada",
    secretNone: "Sin clave API",
    modelEnabled: "Modelo activo",
    organizations: "Disponible para",
    none: "Ninguna organización",
    loading: "Cargando configuración de IA …",
    emptyProviders: "Aún no hay proveedores.",
    emptyModels: "Aún no hay modelos detectados. Ejecuta la detección en un proveedor.",
    pricingFuture:
      "La información de costes está desactivada. El catálogo queda separado para poder añadir precios opcionales más adelante sin cambiar la lógica de roles o proveedores.",
  },
} as const;

export default function InstanceModelsPage() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: "",
    type: "openai-compatible",
    base_url: PROVIDER_DEFAULTS["openai-compatible"],
    api_key: "",
    seed_model: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/instance-llm", { cache: "no-store" });
      if (!response.ok) throw new Error(`status:${response.status}`);
      setCatalog((await response.json()) as Catalog);
    } catch (err) {
      setError(err instanceof Error ? err.message : "instance_llm_load_failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const providers = catalog?.providers ?? [];
  const models = catalog?.models ?? [];
  const organizations = catalog?.organizations ?? [];
  const providerById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers],
  );

  async function request(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(payload?.detail ?? `status:${response.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "instance_llm_save_failed");
    } finally {
      setBusy(false);
    }
  }

  async function createProvider() {
    if (!form.label.trim() || !form.base_url.trim()) return;
    await request("/api/instance-llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_provider",
        label: form.label.trim(),
        type: form.type,
        base_url: form.base_url.trim(),
        api_key: form.api_key || null,
        seed_model: form.seed_model.trim() || null,
        is_active: true,
      }),
    });
    setForm({
      label: "",
      type: "openai-compatible",
      base_url: PROVIDER_DEFAULTS["openai-compatible"],
      api_key: "",
      seed_model: "",
    });
  }

  async function discover(providerId: string) {
    await request("/api/instance-llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "discover", provider_id: providerId }),
    });
  }

  async function toggleProvider(provider: Provider) {
    await request("/api/instance-llm", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "provider",
        id: provider.id,
        is_active: !provider.is_active,
      }),
    });
  }

  async function removeProvider(providerId: string) {
    await request(`/api/instance-llm?provider_id=${encodeURIComponent(providerId)}`, {
      method: "DELETE",
    });
  }

  async function toggleModel(model: Model) {
    await request("/api/instance-llm", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "model",
        id: model.id,
        is_enabled: !model.is_enabled,
      }),
    });
  }

  async function setGrant(model: Model, organizationId: string, enabled: boolean) {
    const next = new Set(model.organization_ids);
    if (enabled) next.add(organizationId);
    else next.delete(organizationId);
    await request("/api/instance-llm", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model_id: model.id,
        organization_ids: [...next],
      }),
    });
  }

  if (loading && !catalog) {
    return <div className={styles.page}>{copy.loading}</div>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      <section className={styles.card}>
        <h2>{copy.add}</h2>
        <div className={styles.form}>
          <label>
            {copy.label}
            <input
              value={form.label}
              onChange={(event) =>
                setForm((current) => ({ ...current, label: event.currentTarget.value }))
              }
            />
          </label>
          <label>
            {copy.type}
            <select
              value={form.type}
              onChange={(event) => {
                const type = event.currentTarget.value;
                setForm((current) => ({
                  ...current,
                  type,
                  base_url: PROVIDER_DEFAULTS[type] ?? current.base_url,
                }));
              }}
            >
              {Object.keys(PROVIDER_DEFAULTS).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            {copy.endpoint}
            <input
              value={form.base_url}
              onChange={(event) =>
                setForm((current) => ({ ...current, base_url: event.currentTarget.value }))
              }
            />
          </label>
          <label>
            {copy.apiKey}
            <input
              type="password"
              value={form.api_key}
              autoComplete="new-password"
              onChange={(event) =>
                setForm((current) => ({ ...current, api_key: event.currentTarget.value }))
              }
            />
          </label>
          <label>
            {copy.seed}
            <input
              value={form.seed_model}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  seed_model: event.currentTarget.value,
                }))
              }
            />
          </label>
          <button
            type="button"
            className="btn"
            disabled={busy || !form.label.trim() || !form.base_url.trim()}
            onClick={() => void createProvider()}
          >
            {copy.create}
          </button>
        </div>
      </section>

      <section className={styles.systemSection}>
        <div className={styles.sectionHeader}>
          <h2>{copy.providers}</h2>
        </div>
        {providers.length === 0 ? (
          <p className={styles.note}>{copy.emptyProviders}</p>
        ) : (
          <div className={styles.grid}>
            {providers.map((provider) => (
              <article className={styles.card} key={provider.id}>
                <h3>{provider.label}</h3>
                <p>{provider.type}</p>
                <p>{provider.base_url}</p>
                <p>{provider.has_api_key ? copy.secretSet : copy.secretNone}</p>
                <div>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void discover(provider.id)}
                  >
                    {copy.discover}
                  </button>{" "}
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void toggleProvider(provider)}
                  >
                    {provider.is_active ? copy.disable : copy.enable}
                  </button>{" "}
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void removeProvider(provider.id)}
                  >
                    {copy.delete}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={styles.systemSection}>
        <div className={styles.sectionHeader}>
          <h2>{copy.models}</h2>
        </div>
        {models.length === 0 ? (
          <p className={styles.note}>{copy.emptyModels}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{copy.providers}</th>
                  <th>Model</th>
                  <th>{copy.modelEnabled}</th>
                  <th>{copy.organizations}</th>
                </tr>
              </thead>
              <tbody>
                {models.map((model) => (
                  <tr key={model.id}>
                    <td>{providerById.get(model.provider_id)?.label ?? "–"}</td>
                    <td>{model.model_id}</td>
                    <td>
                      <label>
                        <input
                          type="checkbox"
                          checked={model.is_enabled}
                          disabled={busy}
                          onChange={() => void toggleModel(model)}
                        />{" "}
                        {model.is_enabled ? copy.active : copy.inactive}
                      </label>
                    </td>
                    <td>
                      {organizations.length === 0 ? (
                        copy.none
                      ) : (
                        <div>
                          {organizations.map((organization) => (
                            <label key={organization.id} style={{ marginRight: 12 }}>
                              <input
                                type="checkbox"
                                checked={model.organization_ids.includes(organization.id)}
                                disabled={busy || !model.is_enabled}
                                onChange={(event) =>
                                  void setGrant(
                                    model,
                                    organization.id,
                                    event.currentTarget.checked,
                                  )
                                }
                              />{" "}
                              {organization.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className={styles.note}>{copy.pricingFuture}</p>
    </div>
  );
}
