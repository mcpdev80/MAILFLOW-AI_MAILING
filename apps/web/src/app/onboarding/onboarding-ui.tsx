"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n";
import type { BootstrapField } from "@/lib/bootstrap-api";
import type { FormEvent } from "react";
import {
  type OnboardingController,
  type OrganizationMember,
  memberUserId,
} from "./use-onboarding-page";

export function OnboardingUi({
  controller,
}: { controller: OnboardingController }) {
  const { t } = useI18n();
  if (controller.loading)
    return (
      <main className="container">
        <p>{t("common.loading")}</p>
      </main>
    );
  return (
    <main className="container">
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <h1>{t("onboarding.title")}</h1>
        <LanguageSwitcher />
      </header>
      <Progress step={controller.step} />
      {controller.bootstrap && <BootstrapSummary controller={controller} />}
      {controller.error && (
        <div className="alert error">{controller.error}</div>
      )}
      {controller.step === "llm" && <ProviderStep controller={controller} />}
      {controller.step === "account" && <AccountStep controller={controller} />}
      {controller.step === "done" && <DoneStep />}
    </main>
  );
}

function BootstrapSummary({ controller }: { controller: OnboardingController }) {
  const { t } = useI18n();
  const bootstrap = controller.bootstrap;
  if (!bootstrap) return null;
  const rows: Array<[string, BootstrapField]> = [
    [t("onboarding.bootstrap.publicUrl"), bootstrap.fields.public_url],
    [t("onboarding.bootstrap.tls"), bootstrap.fields.tls],
    [t("onboarding.bootstrap.language"), bootstrap.fields.language],
  ];
  const configured = rows.filter(([, field]) => field.configured);
  if (configured.length === 0) return null;
  return (
    <section className="card" data-testid="bootstrap-summary">
      <h2>{t("onboarding.bootstrap.title")}</h2>
      <p className="muted">{t("onboarding.bootstrap.description")}</p>
      <div style={{ display: "grid", gap: 10 }}>
        {configured.map(([label, field]) => (
          <div
            key={label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <span>
              <strong>{label}:</strong> {field.value}
            </span>
            <span className="muted">
              ✓ {t("onboarding.bootstrap.configured")} ·{" "}
              {t("onboarding.bootstrap.source")}: {field.source}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Progress({ step }: { step: OnboardingController["step"] }) {
  const { t } = useI18n();
  const current = step === "llm" ? "1" : step === "account" ? "2" : "✓";
  return (
    <p className="muted">
      {t("onboarding.step")} {current} {t("onboarding.of")} 2
    </p>
  );
}

function ProviderStep({ controller }: { controller: OnboardingController }) {
  const { t } = useI18n();
  const form = controller.providerForm;
  function submit(event: FormEvent) {
    event.preventDefault();
    void controller.submitProvider();
  }
  return (
    <form className="card" onSubmit={submit}>
      <h2>{t("onboarding.llm.title")}</h2>
      <TextField
        id="provider-label"
        label={t("onboarding.providerLabel")}
        value={form.label}
        onChange={(label) => controller.setProviderForm({ ...form, label })}
      />
      <div className="row">
        <ProviderType controller={controller} />
        <TextField
          id="provider-url"
          label={t("onboarding.baseUrl")}
          value={form.base_url}
          onChange={(base_url) =>
            controller.setProviderForm({ ...form, base_url })
          }
        />
      </div>
      <div className="row">
        <TextField
          id="classification-model"
          label={t("onboarding.classificationModel")}
          value={form.default_classification_model}
          onChange={(default_classification_model) =>
            controller.setProviderForm({
              ...form,
              default_classification_model,
            })
          }
        />
        <TextField
          id="generation-model"
          label={t("onboarding.generationModel")}
          value={form.default_generation_model}
          onChange={(default_generation_model) =>
            controller.setProviderForm({ ...form, default_generation_model })
          }
        />
      </div>
      <PasswordField controller={controller} />
      <button className="btn" type="submit" disabled={controller.busy}>
        {controller.busy ? t("onboarding.saving") : t("onboarding.continue")}
      </button>
    </form>
  );
}

function ProviderType({ controller }: { controller: OnboardingController }) {
  const { t } = useI18n();
  const form = controller.providerForm;
  return (
    <label className="field" htmlFor="provider-type">
      <span>{t("onboarding.providerType")}</span>
      <select
        id="provider-type"
        value={form.type}
        onChange={(event) =>
          controller.setProviderForm({ ...form, type: event.target.value })
        }
      >
        {(["ollama", "openai", "anthropic", "custom"] as const).map((value) => (
          <option key={value} value={value}>
            {t(`onboarding.provider.${value}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

function PasswordField({ controller }: { controller: OnboardingController }) {
  const { t } = useI18n();
  const form = controller.providerForm;
  return (
    <label className="field" htmlFor="provider-key">
      <span>{t("onboarding.apiKey")}</span>
      <input
        id="provider-key"
        type="password"
        value={form.api_key}
        onChange={(event) =>
          controller.setProviderForm({ ...form, api_key: event.target.value })
        }
      />
      <small className="muted">{t("onboarding.apiKeyHint")}</small>
    </label>
  );
}

function AccountStep({ controller }: { controller: OnboardingController }) {
  return (
    <>
      {controller.hasUserIdentity && <OwnershipCard controller={controller} />}
      <OAuthCard controller={controller} />
      <ImapForm controller={controller} />
    </>
  );
}

function OwnershipCard({ controller }: { controller: OnboardingController }) {
  const { t } = useI18n();
  const form = controller.accountForm;
  return (
    <section className="card">
      <h2>{t("onboarding.mailboxPrivacy")}</h2>
      <label className="field" htmlFor="ownership-mode">
        <span>{t("onboarding.whoAccess")}</span>
        <select
          id="ownership-mode"
          value={form.ownership_mode}
          onChange={(event) =>
            controller.setAccountForm({
              ...form,
              ownership_mode: event.target.value as "private" | "shared",
              shared_user_ids:
                event.target.value === "shared" ? form.shared_user_ids : [],
            })
          }
        >
          <option value="private">{t("onboarding.privateOnlyMe")}</option>
          {controller.canCreateShared && (
            <option value="shared">{t("onboarding.sharedSelected")}</option>
          )}
        </select>
      </label>
      {form.ownership_mode === "shared" && controller.canCreateShared && (
        <MemberAccess controller={controller} />
      )}
    </section>
  );
}

function MemberAccess({ controller }: { controller: OnboardingController }) {
  const { t } = useI18n();
  return (
    <fieldset className="field" style={{ border: 0, padding: 0 }}>
      <legend>{t("onboarding.membersAccess")}</legend>
      {controller.members.map((member) => (
        <MemberOption key={member.id} member={member} controller={controller} />
      ))}
      <p className="muted">{t("onboarding.sharedNotice")}</p>
    </fieldset>
  );
}

function MemberOption({
  member,
  controller,
}: { member: OrganizationMember; controller: OnboardingController }) {
  const userId = memberUserId(member);
  if (!userId) return null;
  const label = member.user?.email ?? member.user?.name ?? userId;
  return (
    <label style={{ display: "flex", gap: 8 }}>
      <input
        type="checkbox"
        checked={controller.accountForm.shared_user_ids.includes(userId)}
        onChange={(event) =>
          controller.toggleSharedUser(userId, event.target.checked)
        }
      />
      <span>
        {label} <span className="muted">· {member.role}</span>
      </span>
    </label>
  );
}

function OAuthCard({ controller }: { controller: OnboardingController }) {
  const { t } = useI18n();
  return (
    <section className="card">
      <h2>{t("onboarding.account.title")}</h2>
      <p className="muted">{t("onboarding.accountDescription")}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn secondary"
          disabled={controller.busy}
          onClick={() => void controller.connectOAuth("gmail")}
        >
          {t("onboarding.gmail")}
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={controller.busy}
          onClick={() => void controller.connectOAuth("microsoft")}
        >
          {t("onboarding.microsoft")}
        </button>
      </div>
      <p className="muted">{t("onboarding.oauthServerHint")}</p>
    </section>
  );
}

function ImapForm({ controller }: { controller: OnboardingController }) {
  const { t } = useI18n();
  const form = controller.accountForm;
  function submit(event: FormEvent) {
    event.preventDefault();
    void controller.submitAccount();
  }
  return (
    <form className="card" onSubmit={submit}>
      <h2>{t("onboarding.imapTitle")}</h2>
      <div className="row">
        <TextField
          id="imap-host"
          label={t("onboarding.imapHost")}
          value={form.imap_host}
          onChange={(imap_host) =>
            controller.setAccountForm({ ...form, imap_host })
          }
        />
        <TextField
          id="imap-user"
          label={t("onboarding.username")}
          value={form.username}
          onChange={(username) =>
            controller.setAccountForm({ ...form, username })
          }
        />
      </div>
      <div className="row">
        <TextField
          id="imap-password"
          label={t("onboarding.password")}
          value={form.password}
          type="password"
          onChange={(password) =>
            controller.setAccountForm({ ...form, password })
          }
        />
        <NumberField controller={controller} />
      </div>
      {controller.providers.length > 0 && (
        <ProviderSelect controller={controller} />
      )}
      <button className="btn" type="submit" disabled={controller.busy}>
        {controller.busy ? t("onboarding.connecting") : t("onboarding.finish")}
      </button>
    </form>
  );
}

function NumberField({ controller }: { controller: OnboardingController }) {
  const { t } = useI18n();
  const form = controller.accountForm;
  return (
    <label className="field" htmlFor="imap-interval">
      <span>{t("onboarding.interval")}</span>
      <input
        id="imap-interval"
        type="number"
        min={1}
        max={1440}
        value={form.interval_minutes}
        onChange={(event) =>
          controller.setAccountForm({
            ...form,
            interval_minutes: Number(event.target.value),
          })
        }
      />
    </label>
  );
}

function ProviderSelect({ controller }: { controller: OnboardingController }) {
  const { t } = useI18n();
  const form = controller.accountForm;
  return (
    <label className="field" htmlFor="mailbox-provider">
      <span>{t("onboarding.llmProvider")}</span>
      <select
        id="mailbox-provider"
        value={form.llm_provider_id}
        onChange={(event) =>
          controller.setAccountForm({
            ...form,
            llm_provider_id: event.target.value,
          })
        }
      >
        {controller.providers.map((provider) => (
          <option key={provider.id} value={provider.id}>
            {provider.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </label>
  );
}

function DoneStep() {
  const { t } = useI18n();
  return (
    <div className="alert ok">
      <strong>{t("onboarding.done.title")}</strong> —{" "}
      {t("onboarding.done.body")}
    </div>
  );
}
