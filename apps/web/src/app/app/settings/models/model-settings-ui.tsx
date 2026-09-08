"use client";

import { useI18n } from "@/lib/i18n";
import type { LLMProvider, LLMRole } from "@/lib/types";
import Link from "next/link";
import { useState } from "react";
import {
  type ModelSettingsController,
  providerTypes,
} from "./use-model-settings";

export function ModelSettingsUi({
  controller,
}: { controller: ModelSettingsController }) {
  const { t } = useI18n();
  if (controller.loading)
    return (
      <main className="container" style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div className="card muted">{t("models.loading")}</div>
      </main>
    );
  return (
    <main className="container" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <p>
        <Link href="/app/dashboard">← {t("models.back")}</Link>
      </p>
      <h1>{t("models.title")}</h1>
      <p className="muted">{t("models.description")}</p>
      {controller.error && (
        <div className="alert error">{errorText(controller.error, t)}</div>
      )}
      {controller.notice && (
        <div className="alert ok">{noticeText(controller.notice, t)}</div>
      )}

      <section style={{ marginTop: 24 }}>
        <div
          className="row"
          style={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <div>
            <h2>{t("models.sources")}</h2>
            <p className="muted">{t("models.sourcesDescription")}</p>
          </div>
          <button
            className="btn"
            type="button"
            onClick={() => controller.setShowAdd(!controller.showAdd)}
          >
            + {t("models.addSource")}
          </button>
        </div>
        {controller.showAdd && <AddSource controller={controller} />}
        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {controller.providers.map((provider) => (
            <SourceCard
              key={provider.id}
              provider={provider}
              controller={controller}
            />
          ))}
          {controller.providers.length === 0 && (
            <div className="card muted">{t("models.empty")}</div>
          )}
        </div>
      </section>

      <section className="card" style={{ marginTop: 28 }}>
        <h2>{t("models.roles")}</h2>
        <p className="muted">{t("models.rolesDescription")}</p>
        <RoleRow
          modelRole="fast"
          title={t("models.fast")}
          controller={controller}
        />
        <RoleRow
          modelRole="deep"
          title={t("models.deep")}
          controller={controller}
        />
        <RoleRow
          modelRole="generation"
          title={t("models.generation")}
          controller={controller}
        />
        <button
          className="btn"
          type="button"
          disabled={controller.busy || controller.activeProviders.length === 0}
          onClick={() => void controller.saveRoles()}
        >
          {controller.busy ? t("models.saving") : t("models.save")}
        </button>
      </section>
    </main>
  );
}

function AddSource({ controller }: { controller: ModelSettingsController }) {
  const { t } = useI18n();
  const draftModels = controller.models.draft ?? [];
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3>{t("models.newSource")}</h3>
      <div className="row">
        <Field
          label={t("models.sourceName")}
          value={controller.sourceDraft.label}
          onChange={(label) =>
            controller.setSourceDraft((c) => ({ ...c, label }))
          }
        />
        <label className="field">
          <span>{t("models.providerType")}</span>
          <select
            value={controller.sourceDraft.type}
            onChange={(e) => controller.setSourceType(e.target.value)}
          >
            {providerTypes.map((type) => (
              <option key={type} value={type}>
                {providerLabel(type)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <Field
          label={t("models.baseUrl")}
          value={controller.sourceDraft.baseUrl}
          onChange={(baseUrl) =>
            controller.setSourceDraft((c) => ({ ...c, baseUrl }))
          }
        />
        <Field
          label={t("models.apiKey")}
          type="password"
          value={controller.sourceDraft.apiKey}
          onChange={(apiKey) =>
            controller.setSourceDraft((c) => ({ ...c, apiKey }))
          }
        />
      </div>
      <div className="row" style={{ alignItems: "end" }}>
        <div className="field">
          <span>{t("models.model")}</span>
          {draftModels.length ? (
            <select
              value={controller.sourceDraft.model}
              onChange={(e) =>
                controller.setSourceDraft((c) => ({
                  ...c,
                  model: e.target.value,
                }))
              }
            >
              <option value="">{t("models.selectModel")}</option>
              {draftModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={controller.sourceDraft.model}
              onChange={(e) =>
                controller.setSourceDraft((c) => ({
                  ...c,
                  model: e.target.value,
                }))
              }
              placeholder={t("models.manualModel")}
            />
          )}
        </div>
        <button
          className="btn secondary"
          type="button"
          disabled={controller.busy}
          onClick={() => void controller.discoverDraftModels()}
        >
          {t("models.testAndLoad")}
        </button>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn"
          type="button"
          disabled={controller.busy}
          onClick={() => void controller.addSource()}
        >
          {t("models.createSource")}
        </button>
        <button
          className="btn secondary"
          type="button"
          onClick={() => controller.setShowAdd(false)}
        >
          {t("models.cancel")}
        </button>
      </div>
    </div>
  );
}

function SourceCard({
  provider,
  controller,
}: { provider: LLMProvider; controller: ModelSettingsController }) {
  const { t } = useI18n();
  const [label, setLabel] = useState(provider.label);
  const [baseUrl, setBaseUrl] = useState(provider.base_url);
  const [apiKey, setApiKey] = useState("");
  const editing = controller.editingId === provider.id;
  const known = controller.models[provider.id] ?? [];
  return (
    <div className="card" style={{ opacity: provider.is_active ? 1 : 0.65 }}>
      <div
        className="row"
        style={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <div>
          <strong>{provider.label}</strong>
          <div className="muted">
            {providerLabel(provider.type)} · {provider.base_url}
          </div>
          <div className="muted">
            {provider.is_active ? t("models.active") : t("models.inactive")}
            {known.length
              ? ` · ${known.length} ${t("models.modelsFound")}`
              : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            className="btn secondary"
            type="button"
            onClick={() => void controller.discoverSource(provider.id)}
          >
            {t("models.test")}
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={() =>
              controller.setEditingId(editing ? null : provider.id)
            }
          >
            {t("models.edit")}
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={() => void controller.toggleSource(provider)}
          >
            {provider.is_active ? t("models.disable") : t("models.enable")}
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              if (window.confirm(t("models.deleteConfirm")))
                void controller.removeSource(provider);
            }}
          >
            {t("models.delete")}
          </button>
        </div>
      </div>
      {editing && (
        <div style={{ marginTop: 12 }}>
          <div className="row">
            <Field
              label={t("models.sourceName")}
              value={label}
              onChange={setLabel}
            />
            <Field
              label={t("models.baseUrl")}
              value={baseUrl}
              onChange={setBaseUrl}
            />
          </div>
          <Field
            label={t("models.newApiKey")}
            type="password"
            value={apiKey}
            onChange={setApiKey}
          />
          <button
            className="btn"
            type="button"
            onClick={() =>
              void controller.saveSource(provider, { label, baseUrl, apiKey })
            }
          >
            {t("models.saveSource")}
          </button>
        </div>
      )}
      {known.length > 0 && (
        <div
          className="muted"
          style={{ marginTop: 10, wordBreak: "break-word" }}
        >
          {known.slice(0, 8).join(" · ")}
          {known.length > 8 ? ` · +${known.length - 8}` : ""}
        </div>
      )}
    </div>
  );
}

function RoleRow({
  modelRole,
  title,
  controller,
}: { modelRole: LLMRole; title: string; controller: ModelSettingsController }) {
  const { t } = useI18n();
  const value = controller.roles[modelRole];
  const provider = controller.providers.find(
    (item) => item.id === value.providerId,
  );
  const known = value.providerId
    ? (controller.models[value.providerId] ?? [])
    : [];
  const fallbackModels = provider
    ? [
        modelRole === "generation"
          ? (provider.generation_model ?? provider.default_generation_model)
          : modelRole === "deep"
            ? (provider.deep_classification_model ??
              provider.default_classification_model)
            : (provider.fast_classification_model ??
              provider.default_classification_model),
      ]
    : [];
  const options = Array.from(
    new Set([...known, ...fallbackModels].filter(Boolean) as string[]),
  );
  return (
    <div
      style={{
        margin: "20px 0",
        paddingTop: 14,
        borderTop: "1px solid var(--border, #2a2d36)",
      }}
    >
      <h3>{title}</h3>
      <div className="row">
        <label className="field">
          <span>{t("models.source")}</span>
          <select
            value={value.providerId}
            onChange={(e) =>
              void controller.setRoleProvider(modelRole, e.target.value)
            }
          >
            <option value="">{t("models.selectSource")}</option>
            {controller.activeProviders.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} · {providerLabel(item.type)}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>{t("models.model")}</span>
          {options.length ? (
            <select
              value={value.modelId}
              onChange={(e) =>
                controller.setRoleModel(modelRole, e.target.value)
              }
            >
              {options.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={value.modelId}
              onChange={(e) =>
                controller.setRoleModel(modelRole, e.target.value)
              }
              placeholder={t("models.manualModel")}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function providerLabel(type: string) {
  return (
    (
      {
        "openai-compatible": "OpenAI-compatible",
        openai: "OpenAI",
        anthropic: "Anthropic / Claude",
        gemini: "Google Gemini",
        openrouter: "OpenRouter",
        ollama: "Ollama",
      } as Record<string, string>
    )[type] ?? type
  );
}
function errorText(value: string, t: ReturnType<typeof useI18n>["t"]) {
  if (value === "source_fields_required")
    return t("models.sourceFieldsRequired");
  if (value === "role_fields_required") return t("models.roleFieldsRequired");
  if (value.includes("discovery")) return t("models.discoveryFailed");
  return value;
}
function noticeText(value: string, t: ReturnType<typeof useI18n>["t"]) {
  if (value === "created") return t("models.sourceCreated");
  if (value === "deleted") return t("models.sourceDeleted");
  if (value === "models") return t("models.modelsLoaded");
  if (value === "roles") return t("models.saved");
  return t("models.sourceSaved");
}
