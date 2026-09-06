"use client";

import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import type { FormEvent } from "react";
import type { useSignupPage } from "./use-signup-page";

type SignupState = ReturnType<typeof useSignupPage>;

export function SignupUi({ state }: { state: SignupState }) {
  const { t } = useI18n();
  function submit(event: FormEvent) {
    event.preventDefault();
    void state.submit();
  }
  return (
    <main className="auth-shell">
      <section className="auth-panel auth-panel-wide">
        <div className="auth-brand">MailFlow</div>
        <div className="auth-copy">
          <h1>{t("auth.signup.title")}</h1>
          <p className="muted">{t("home.tagline")}</p>
        </div>

        {state.error && <div className="alert error">{state.error}</div>}

        <form onSubmit={submit} className="auth-form">
          <div className="row">
            <Field
              id="name"
              label={t("auth.signup.name")}
              value={state.name}
              autoComplete="name"
              onChange={state.setName}
            />
            <Field
              id="organization"
              label={t("auth.signup.organization")}
              value={state.organization}
              onChange={state.setOrganization}
            />
          </div>
          <Field
            id="email"
            label={t("auth.signup.email")}
            type="email"
            value={state.email}
            autoComplete="email"
            onChange={state.setEmail}
          />
          <Field
            id="password"
            label={t("auth.signup.password")}
            type="password"
            value={state.password}
            autoComplete="new-password"
            minLength={8}
            onChange={state.setPassword}
          />
          <button type="submit" className="btn btn-lg auth-primary" disabled={state.busy}>
            {state.busy ? t("auth.signup.creating") : t("auth.signup.action")}
          </button>
        </form>

        <p className="auth-switch muted">
          {t("auth.signup.hasAccount")}{" "}
          <Link href="/login">{t("auth.signup.login")}</Link>
        </p>
      </section>
    </main>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  minLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  minLength?: number;
}) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        minLength={minLength}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
