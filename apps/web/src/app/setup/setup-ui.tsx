"use client";

import { WizardShell, wizardStyles as s } from "@/components/wizard-shell";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { type BootstrapStatus, getBootstrapStatus } from "@/lib/bootstrap-api";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ProviderForm = {
  label: string;
  type: string;
  base_url: string;
  default_classification_model: string;
  default_generation_model: string;
  api_key: string;
};

type TlsMode = "automatic" | "custom" | "external";

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
  const [bootstrapLoaded, setBootstrapLoaded] = useState(false);
  const [theme, setTheme] = useState<"system" | "light" | "dark">("dark");
  const [language, setLanguage] = useState("en");
  const [publicUrl, setPublicUrl] = useState("");
  const [internalUrl, setInternalUrl] = useState("");
  const [tlsMode, setTlsMode] = useState<TlsMode>("automatic");
  const [provider, setProvider] = useState(emptyProvider);
  const [providerModels, setProviderModels] = useState<string[]>([]);
  const [providerConnectionReady, setProviderConnectionReady] = useState(false);
  const [providerReady, setProviderReady] = useState(false);
  const [healthReady, setHealthReady] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerPasswordConfirm, setOwnerPasswordConfirm] = useState("");
  const [organization, setOrganization] = useState("");
  const [ownerCreated, setOwnerCreated] = useState(false);
  const [passkeyAdded, setPasskeyAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
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
        ) {
          setLanguage(configuredLanguage);
        }

        const configuredPublicUrl = boot.value.fields.public_url.value;
        if (configuredPublicUrl) setPublicUrl(configuredPublicUrl);

        const configuredTlsMode = boot.value.fields.tls.value;
        if (
          configuredTlsMode === "automatic" ||
          configuredTlsMode === "custom" ||
          configuredTlsMode === "external"
        ) {
          setTlsMode(configuredTlsMode);
        }
      }
      setBootstrapLoaded(true);

      if (health.status === "fulfilled") {
        setHealthReady(
          health.value.status === "ok" && health.value.db === "up",
        );
      }
      if (providers.status === "fulfilled" && providers.value.length > 0) {
        setProviderReady(true);
      }
    });
  }, []);

  const languageConfigured = bootstrap?.fields.language.configured ?? false;
  const publicUrlConfigured = bootstrap?.fields.public_url.configured ?? false;
  const tlsConfigured = bootstrap?.fields.tls.configured ?? false;
  const connectionConfigured = publicUrlConfigured && tlsConfigured;
  const publicUrlManaged = bootstrap?.fields.public_url.managed ?? false;
  const tlsManaged = bootstrap?.fields.tls.managed ?? false;

  function resetProviderDiscovery(next: ProviderForm) {
    setProvider(next);
    setProviderModels([]);
    setProviderConnectionReady(false);
  }

  async function discoverModels() {
    if (!provider.base_url.trim()) return;
    setDiscoveryBusy(true);
    setError(null);
    try {
      const result = await api.discoverProviderModels({
        type: provider.type,
        base_url: provider.base_url.trim(),
        api_key: provider.api_key || null,
      });
      setProviderModels(result.models);
      setProviderConnectionReady(true);
      setProvider((current) => ({
        ...current,
        base_url: current.base_url.trim(),
        default_classification_model: result.models.includes(
          current.default_classification_model,
        )
          ? current.default_classification_model
          : result.models[0] || "",
        default_generation_model: result.models.includes(
          current.default_generation_model,
        )
          ? current.default_generation_model
          : result.models[0] || "",
      }));
    } catch (err) {
      setProviderModels([]);
      setProviderConnectionReady(false);
      setError(
        err instanceof Error ? err.message : "Unable to load provider models",
      );
    } finally {
      setDiscoveryBusy(false);
    }
  }

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

  async function createInstanceOwner() {
    setError(null);
    if (!ownerName.trim() || !ownerEmail.trim() || !organization.trim()) {
      setError("Name, email address and organization are required.");
      return;
    }
    if (ownerPassword.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }
    if (ownerPassword !== ownerPasswordConfirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const status = await fetch("/api/instance-bootstrap/status", {
        cache: "no-store",
      });
      if (!status.ok) throw new Error("Unable to verify instance owner state.");
      const bootstrapState = (await status.json()) as {
        auth_enabled: boolean;
        instance_owner_exists: boolean;
      };
      if (bootstrapState.instance_owner_exists) {
        throw new Error("The instance owner has already been created.");
      }

      const signUp = await authClient.signUp.email({
        email: ownerEmail.trim(),
        password: ownerPassword,
        name: ownerName.trim(),
      });
      if (signUp.error) {
        throw new Error(signUp.error.message ?? "Unable to create administrator.");
      }

      const orgName = organization.trim();
      const org = await authClient.organization.create({
        name: orgName,
        slug: organizationSlug(orgName),
      });
      if (org.error) {
        throw new Error(org.error.message ?? "Unable to create organization.");
      }

      const claim = await fetch("/api/instance-bootstrap/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!claim.ok) {
        const detail = (await claim.json().catch(() => null)) as
          | { detail?: string }
          | null;
        throw new Error(
          detail?.detail === "instance_owner_already_exists"
            ? "The instance owner was already claimed by another setup session."
            : "Unable to assign the instance owner role.",
        );
      }

      setOwnerCreated(true);
      setOwnerPassword("");
      setOwnerPasswordConfirm("");
      setStep(5);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create instance owner",
      );
    } finally {
      setBusy(false);
    }
  }

  async function addPasskey() {
    setPasskeyBusy(true);
    setError(null);
    try {
      const result = await authClient.passkey.addPasskey({
        name: "Mailflow Instance Owner",
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Unable to register passkey.");
      }
      setPasskeyAdded(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to register passkey",
      );
    } finally {
      setPasskeyBusy(false);
    }
  }

  if (!bootstrapLoaded) return null;

  if (step === 1) {
    return (
      <WizardShell
        kind="setup"
        step={1}
        total={5}
        title={languageConfigured ? "Appearance" : "Language & Appearance"}
        subtitle={
          languageConfigured
            ? "The installer already configured the instance language. Choose the default appearance."
            : "Set initial defaults for your Mailflow instance. Users can override these individually."
        }
        next={{
          label: "Continue",
          onClick: () => setStep(connectionConfigured ? 3 : 2),
        }}
      >
        <div className={s.section}>
          {!languageConfigured ? (
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
          ) : null}
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
            {languageConfigured
              ? `Language from installer: ${language.toUpperCase()}. Users can override it individually.`
              : "These are instance defaults. Each user can choose their own preferences."}
          </span>
        </div>
      </WizardShell>
    );
  }

  if (step === 2) {
    const tlsOptions: Array<{ value: TlsMode; label: string }> = [
      { value: "automatic", label: "Automatic (Let's Encrypt)" },
      { value: "custom", label: "Own certificate" },
      { value: "external", label: "Managed externally (reverse proxy)" },
    ];

    return (
      <WizardShell
        kind="setup"
        step={2}
        total={5}
        title="URL & HTTPS"
        subtitle="Only values not provided by the installer need to be configured here."
        back={{ onClick: () => setStep(1) }}
        next={{ label: "Continue", onClick: () => setStep(3) }}
      >
        <div className={s.section}>
          {!publicUrlConfigured ? (
            <label className={s.field}>
              <span className={s.labelRow}>
                <span>External URL</span>
              </span>
              <input
                value={publicUrl}
                onChange={(e) => setPublicUrl(e.target.value)}
                readOnly={publicUrlManaged}
                placeholder="e.g. https://mail.example.com"
              />
            </label>
          ) : null}

          <label className={s.field}>
            Internal URL <small>Optional</small>
            <input
              value={internalUrl}
              onChange={(e) => setInternalUrl(e.target.value)}
              placeholder="e.g. http://mailflow.internal"
            />
          </label>

          {!tlsConfigured ? (
            <div className={s.field}>
              TLS Configuration
              <div className={s.radioList}>
                {tlsOptions.map(({ value, label }) => (
                  <label className={s.radio} key={value}>
                    <input
                      type="radio"
                      name="tls-mode"
                      value={value}
                      checked={tlsMode === value}
                      onChange={() => setTlsMode(value)}
                      disabled={tlsManaged}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div className={s.statusRow}>
            <span className={s.statusBadge}>
              {publicUrl.startsWith("https://") ? "VALID HTTPS" : "CHECK HTTPS"}
            </span>
            <span>
              Installer-provided URL and TLS values are reused automatically.
            </span>
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
        total={5}
        title="AI Provider"
        subtitle="Save the endpoint connection, load its models, then choose which models Mailflow should use."
        back={{ onClick: () => setStep(connectionConfigured ? 1 : 2) }}
        next={{
          label: providerReady ? "Continue" : "Save & Continue",
          onClick: () => void saveProvider(),
          disabled:
            busy ||
            (!providerReady &&
              (!providerConnectionReady ||
                !provider.default_classification_model ||
                !provider.default_generation_model)),
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
                    resetProviderDiscovery({
                      ...provider,
                      type: e.target.value,
                      default_classification_model: "",
                      default_generation_model: "",
                    })
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
                    resetProviderDiscovery({
                      ...provider,
                      base_url: e.target.value,
                      default_classification_model: "",
                      default_generation_model: "",
                    })
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
                    resetProviderDiscovery({
                      ...provider,
                      api_key: e.target.value,
                      default_classification_model: "",
                      default_generation_model: "",
                    })
                  }
                  placeholder="Optional for local providers"
                />
              </label>

              <button
                type="button"
                onClick={() => void discoverModels()}
                disabled={discoveryBusy || !provider.base_url.trim()}
              >
                {discoveryBusy
                  ? "Loading models..."
                  : "Save connection & load models"}
              </button>

              {providerConnectionReady && providerModels.length > 0 ? (
                <>
                  <div className={s.success}>
                    <span className={s.check}>✓</span>
                    <div>
                      <strong>Endpoint connected</strong>
                      <span>{providerModels.length} model(s) discovered.</span>
                    </div>
                  </div>

                  <label className={s.field}>
                    Classification model
                    <select
                      value={provider.default_classification_model}
                      onChange={(e) =>
                        setProvider({
                          ...provider,
                          default_classification_model: e.target.value,
                        })
                      }
                    >
                      {providerModels.map((model) => (
                        <option value={model} key={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={s.field}>
                    Generation model
                    <select
                      value={provider.default_generation_model}
                      onChange={(e) =>
                        setProvider({
                          ...provider,
                          default_generation_model: e.target.value,
                        })
                      }
                    >
                      {providerModels.map((model) => (
                        <option value={model} key={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
            </>
          )}
          {error && <div className={s.error}>{error}</div>}
        </div>
        <div className={s.info}>
          <span className={s.infoIcon}>i</span>
          <span>
            The API key is sent only to your Mailflow backend for model
            discovery and is stored encrypted when you finish saving the
            provider.
          </span>
        </div>
      </WizardShell>
    );
  }

  if (step === 4) {
    return (
      <WizardShell
        kind="setup"
        step={4}
        total={5}
        title="Create Instance Owner"
        subtitle="Create the first Mailflow administrator and the first organization. This account owns the instance and its organization."
        back={{ onClick: () => setStep(3) }}
        next={{
          label: busy ? "Creating..." : "Create Instance Owner",
          onClick: () => void createInstanceOwner(),
          disabled: busy || !healthReady || !providerReady,
        }}
      >
        <div className={s.section}>
          <label className={s.field}>
            Name
            <input
              autoComplete="name"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Administrator name"
            />
          </label>
          <label className={s.field}>
            Email address
            <input
              type="email"
              autoComplete="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="admin@example.com"
            />
          </label>
          <label className={s.field}>
            Organization
            <input
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="Example GmbH"
            />
          </label>
          <label className={s.field}>
            Password
            <input
              type="password"
              autoComplete="new-password"
              value={ownerPassword}
              onChange={(e) => setOwnerPassword(e.target.value)}
            />
          </label>
          <label className={s.field}>
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              value={ownerPasswordConfirm}
              onChange={(e) => setOwnerPasswordConfirm(e.target.value)}
            />
          </label>
          {error && <div className={s.error}>{error}</div>}
        </div>
        <div className={s.info}>
          <span className={s.infoIcon}>i</span>
          <span>
            The first account becomes the Instance Owner exactly once. Additional
            organization owners do not automatically receive instance-wide
            administrator privileges.
          </span>
        </div>
      </WizardShell>
    );
  }

  return (
    <WizardShell
      kind="setup"
      step={5}
      total={5}
      title="Instance Verification"
      subtitle="Your Instance Owner is created. Optionally register a passkey, then continue with mailbox onboarding."
      next={{
        label: "Continue to onboarding",
        onClick: () => router.push("/onboarding"),
        disabled: !ownerCreated,
      }}
    >
      <div className={s.checklist}>
        <Check label="Frontend reachable" ready={true} />
        <Check label="API reachable" ready={healthReady} />
        <Check label="Authentication configured" ready={true} />
        <Check label="Database healthy" ready={healthReady} />
        <Check label="HTTPS valid" ready={publicUrl.startsWith("https://")} />
        <Check label="AI provider connected" ready={providerReady} />
        <Check label="Instance Owner created" ready={ownerCreated} />
        <Check label="Passkey registered" ready={passkeyAdded} />
      </div>

      {!passkeyAdded ? (
        <button
          type="button"
          onClick={() => void addPasskey()}
          disabled={passkeyBusy || !ownerCreated}
        >
          {passkeyBusy ? "Registering passkey..." : "Register passkey now"}
        </button>
      ) : null}

      {error && <div className={s.error}>{error}</div>}

      <div className={s.success}>
        <span className={s.check}>✓</span>
        <div>
          <strong>Instance setup complete</strong>
          <span>
            Passkey registration is optional and can also be configured later.
          </span>
        </div>
      </div>
    </WizardShell>
  );
}

function organizationSlug(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "org"}-${suffix}`;
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
