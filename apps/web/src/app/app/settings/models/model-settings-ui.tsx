"use client";

import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import type {
  ModelFormState,
  ModelSettingsController,
} from "./use-model-settings";

export function ModelSettingsUi({
  controller,
}: { controller: ModelSettingsController }) {
  const { t } = useI18n();
  return (
    <main className="container" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <p>
        <Link href="/app/dashboard">← {t("models.back")}</Link>
      </p>
      <h1>{t("models.title")}</h1>
      <p className="muted">{t("models.description")}</p>
      {controller.error && (
        <div className="alert error">{modelError(controller.error, t)}</div>
      )}
      {controller.notice && <div className="alert ok">{t("models.saved")}</div>}
      {controller.loading ? (
        <div className="card muted">{t("models.loading")}</div>
      ) : (
        <ModelSettingsContent controller={controller} />
      )}
    </main>
  );
}

function ModelSettingsContent({
  controller,
}: { controller: ModelSettingsController }) {
  if (controller.providers.length === 0) return <EmptyProviders />;
  return <ModelForm controller={controller} />;
}

function EmptyProviders() {
  const { t } = useI18n();
  return (
    <div className="card">
      <p>{t("models.empty")}</p>
      <Link className="btn" href="/onboarding">
        {t("models.configure")}
      </Link>
    </div>
  );
}

function ModelForm({ controller }: { controller: ModelSettingsController }) {
  const { t } = useI18n();
  return (
    <form
      className="card"
      onSubmit={(event) => {
        event.preventDefault();
        void controller.save();
      }}
    >
      <label className="field">
        <span>{t("models.provider")}</span>
        <select
          value={controller.providerId}
          onChange={(event) => controller.selectProvider(event.target.value)}
        >
          {controller.providers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <RoleSection
        controller={controller}
        role="fast"
        title={t("models.fast")}
      />
      <RoleSection
        controller={controller}
        role="deep"
        title={t("models.deep")}
      />
      <RoleSection
        controller={controller}
        role="generation"
        title={t("models.generation")}
      />
      <button className="btn" type="submit" disabled={controller.busy}>
        {controller.busy ? t("models.saving") : t("models.save")}
      </button>
    </form>
  );
}

type Role = "fast" | "deep" | "generation";

function RoleSection({
  controller,
  role,
  title,
}: { controller: ModelSettingsController; role: Role; title: string }) {
  const { t } = useI18n();
  const keys = roleKeys(role);
  const provider = controller.provider;
  const configured =
    role === "fast"
      ? provider?.has_fast_api_key
      : role === "deep"
        ? provider?.has_deep_api_key
        : provider?.has_generation_api_key;
  const modelPlaceholder =
    role === "generation"
      ? provider?.default_generation_model
      : provider?.default_classification_model;
  return (
    <section style={{ margin: "20px 0" }}>
      <h2>{title}</h2>
      <div className="row">
        <TextInput
          label={t("models.model")}
          value={controller.form[keys.model]}
          placeholder={modelPlaceholder}
          onChange={(value) => patch(controller, keys.model, value)}
        />
        <TextInput
          label={t("models.endpoint")}
          value={controller.form[keys.url]}
          placeholder={provider?.base_url}
          onChange={(value) => patch(controller, keys.url, value)}
        />
      </div>
      <TextInput
        type="password"
        label={t("models.apiKey")}
        value={controller.form[keys.key]}
        placeholder={
          configured ? t("models.configured") : t("models.sharedKey")
        }
        onChange={(value) => patch(controller, keys.key, value)}
      />
    </section>
  );
}

function TextInput({
  label,
  value,
  placeholder,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string | null;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder ?? undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function roleKeys(role: Role): {
  model: keyof ModelFormState;
  url: keyof ModelFormState;
  key: keyof ModelFormState;
} {
  if (role === "fast")
    return { model: "fastModel", url: "fastBaseUrl", key: "fastApiKey" };
  if (role === "deep")
    return { model: "deepModel", url: "deepBaseUrl", key: "deepApiKey" };
  return {
    model: "generationModel",
    url: "generationBaseUrl",
    key: "generationApiKey",
  };
}

function patch(
  controller: ModelSettingsController,
  key: keyof ModelFormState,
  value: string,
) {
  controller.setForm((current) => ({ ...current, [key]: value }));
}

function modelError(value: string, t: ReturnType<typeof useI18n>["t"]) {
  if (value === "model_settings_load_failed") return t("models.loadFailed");
  if (value === "model_settings_save_failed") return t("models.saveFailed");
  return value;
}
