"use client";

import { WizardShell, wizardStyles as s } from "@/components/wizard-shell";
import { api } from "@/lib/api";
import { type BootstrapStatus, getBootstrapStatus } from "@/lib/bootstrap-api";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ProviderForm = {
  label: string;
  type: string;
  base_url: string;
  default_classification_model: string;
  default_generation_model: string;
  api_key: string;
};

const emptyProvider: ProviderForm = {
  label: "Mailflow AI",
  type: "custom",
  base_url: "",
  default_classification_model: "",
  default_generation_model: "",
  api_key: "",
};

export function InstanceSetup() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [bootstrap, setBootstrap] = useState<BootstrapStatus | null>(null);
  const [theme, setTheme] = useState<"system" | "light" | "dark">("dark");
  const [language, setLanguage] = useState("en");
  const [provider, setProvider] = useState(emptyProvider);
  const [providerReady, setProviderReady] = useState(false);
  const [healthReady, setHealthReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.allSettled([
      getBootstrapStatus(),
      api.health(),
      api.listProviders(),
    ]).then(([boot, health, providers]) => {
      if (boot.status === "fulfilled") {
        setBootstrap(boot.value);
        const configuredLanguage = boot.value.fields.language.value;
        if (
          configuredLanguage === "de" ||
          configuredLanguage === "en" ||
          configuredLanguage === "es"
        )
          setLanguage(configuredLanguage);
      }
      if (health.status === "fulfilled")
        setHealthReady(
          health.value.status === "ok" && health.value.db === "up",
        );
      if (providers.status === "fulfilled" && providers.value.length > 0)
        setProviderReady(true);
    });
  }, []);

  const tlsMode = useMemo(
    () => bootstrap?.fields.tls.value ?? "unknown",
    [bootstrap],
  );
  const publicUrl = bootstrap?.fields.public_url.value ?? "Not configured";

  async function saveProvider() {
    if (providerReady) {
      setStep(4);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createProvider({
        ...provider,
        api_key: provider.api_key || null,
      });
      setProviderReady(true);
      setStep(4);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save AI provider",
      );
    } finally {
      setBusy(false);
    }
  }

  if (step === 1) {
    return (
      <WizardShell
        kind="setup"
        step={1}
        total={4}
        title="Language & Appearance"
        subtitle="Set initial defaults for your Mailflow instance. Users can override these individually."
        next={{ label: "Continue", onClick: () => setStep(2) }}
      >
        <div className={s.section}>
          <label className={s.field}>
            Default Language
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="de">Deutsch</option>
              <option value="es">Español</option>
            </select>
          </label>
          <div className={s.field}>
            Default Theme
            <div className={s.themeGrid}>
              {(["system", "light", "dark"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  className={`${s.themeCard} ${theme === value ? s.themeCardSelected : ""}`}
                  onClick={() => setTheme(value)}
                >
                  <span
                    className={`${s.themePreview} ${value === "light" ? s.themePreviewLight : ""}`}
                  >
                    <span className={s.themePreviewHeader} />
                    <span className={s.themePreviewBody}>
                      <span className={s.themePreviewSidebar} />
                      <span className={s.themePreviewCards}>
                        <span />
                        <span />
                      </span>
                    </span>
                  </span>
                  <span className={s.themeLabel}>
                    <span>{value[0].toUpperCase() + value.slice(1)}</span>
                    <span>{theme === value ? "●" : "○"}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={s.info}>
          <span className={s.infoIcon}>i</span>
          <span>
            These are instance defaults. Each user can choose their own
            preferences.
          </span>
        </div>
      </WizardShell>
    );
  }

  if (step === 2) {
    const tlsLabel =
      tlsMode === "custom"
        ? "Own certificate"
        : tlsMode === "external"
          ? "Managed externally (reverse proxy)"
          : "Automatic (Let's Encrypt)";
    return (
      <WizardShell
        kind="setup"
        step={2}
        total={4}
        title="URL & HTTPS"
        subtitle="Configure how Mailflow is accessed."
        back={{ onClick: () => setStep(1) }}
        next={{ label: "Continue", onClick: () => setStep(3) }}
      >
        <div className={s.section}>
          <label className={s.field}>
            <span className={s.labelRow}>
              <span>External URL</span>
              <span className={s.detected}>✓ Auto-detected</span>
            </span>
            <input readOnly value={publicUrl} />
          </label>
          <label className={s.field}>
            Internal URL{" "}
            <small>
              Optional · not configured by the current deployment contract
            </small>
            <input readOnly placeholder="e.g. http://mailflow.internal" />
          </label>
          <div className={s.field}>
            TLS Configuration
            <div className={s.radioList}>
              {[
                "Automatic (Let's Encrypt)",
                "Own certificate",
                "Managed externally (reverse proxy)",
              ].map((label) => (
                <label className={s.radio} key={label}>
                  <input type="radio" checked={tlsLabel === label} readOnly />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className={s.statusRow}>
            <span className={s.statusBadge}>
              {publicUrl.startsWith("https://") ? "VALID HTTPS" : "CHECK HTTPS"}
            </span>
            <span>Deployment-owned values are shown read-only.</span>
          </div>
        </div>
        <p style={{ margin: 0, color: "#71717a", fontSize: 12 }}>
          HTTPS secures access to your Mailflow instance.
        </p>
      </WizardShell>
    );
  }

  if (step === 3) {
    return (
      <WizardShell
        kind="setup"
        step={3}
        total={4}
        title="AI Provider"
        subtitle="Connect the model endpoint Mailflow should use."
        back={{ onClick: () => setStep(2) }}
        next={{
          label: providerReady ? "Continue" : "Save & Continue",
          onClick: () => void saveProvider(),
          disabled:
            busy ||
            (!providerReady &&
              (!provider.base_url || !provider.default_classification_model)),
        }}
      >
        <div className={s.section}>
          {providerReady ? (
            <div className={s.success}>
              <span className={s.check}>✓</span>
              <div>
                <strong>AI provider connected</strong>
                <span>
                  An existing provider is already configured for this instance.
                </span>
              </div>
            </div>
          ) : (
            <>
              <label className={s.field}>
                Provider
                <select
                  value={provider.type}
                  onChange={(e) =>
                    setProvider({ ...provider, type: e.target.value })
                  }
                >
                  <option value="custom">OpenAI-compatible</option>
                  <option value="openai">OpenAI</option>
                  <option value="ollama">Ollama</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </label>
              <label className={s.field}>
                Endpoint URL
                <input
                  value={provider.base_url}
                  onChange={(e) =>
                    setProvider({ ...provider, base_url: e.target.value })
                  }
                  placeholder="https://your-ai-endpoint/v1"
                />
              </label>
              <label className={s.field}>
                API Key
                <input
                  type="password"
                  value={provider.api_key}
                  onChange={(e) =>
                    setProvider({ ...provider, api_key: e.target.value })
                  }
                  placeholder="Optional for local providers"
                />
              </label>
              <label className={s.field}>
                Classification model
                <input
                  value={provider.default_classification_model}
                  onChange={(e) =>
                    setProvider({
                      ...provider,
                      default_classification_model: e.target.value,
                    })
                  }
                  placeholder="Model name"
                />
              </label>
              <label className={s.field}>
                Generation model
                <input
                  value={provider.default_generation_model}
                  onChange={(e) =>
                    setProvider({
                      ...provider,
                      default_generation_model: e.target.value,
                    })
                  }
                  placeholder="Model name"
                />
              </label>
            </>
          )}
          {error && <div className={s.error}>{error}</div>}
        </div>
        <div className={s.info}>
          <span className={s.infoIcon}>i</span>
          <span>
            API keys are stored encrypted and are not re-displayed after saving.
          </span>
        </div>
      </WizardShell>
    );
  }

  return (
    <WizardShell
      kind="setup"
      step={4}
      total={4}
      title="Instance Verification"
      subtitle="Verify the instance before user onboarding."
      back={{ onClick: () => setStep(3) }}
      next={{
        label: "Open Mailflow",
        onClick: () => router.push("/onboarding"),
        disabled: !healthReady || !providerReady,
      }}
    >
      <div className={s.checklist}>
        <Check label="Frontend reachable" ready={true} />
        <Check label="API reachable" ready={healthReady} />
        <Check label="Authentication configured" ready={true} />
        <Check label="Database healthy" ready={healthReady} />
        <Check label="HTTPS valid" ready={publicUrl.startsWith("https://")} />
        <Check label="AI provider connected" ready={providerReady} />
      </div>
      <div className={s.success}>
        <span className={s.check}>✓</span>
        <div>
          <strong>Configuration verified</strong>
          <span>Mailflow is ready for user onboarding.</span>
        </div>
      </div>
    </WizardShell>
  );
}

function Check({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className={s.checkRow}>
      <span className={s.check}>{ready ? "✓" : "·"}</span>
      <span>{label}</span>
      <span>{ready ? "Ready" : "Pending"}</span>
    </div>
  );
}
