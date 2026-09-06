"use client";

import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import type { FormEvent } from "react";
import type { useLoginPage } from "./use-login-page";

type LoginState = ReturnType<typeof useLoginPage>;

export function LoginUi({ state }: { state: LoginState }) {
  const { t } = useI18n();
  function submit(event: FormEvent) {
    event.preventDefault();
    void state.signInWithPassword();
  }
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand">Mailflow</div>
        <div className="auth-copy">
          <h1>{t("auth.login.title")}</h1>
          <p>Sign in to continue to your Mailflow workspace.</p>
        </div>

        {state.error && <div className="alert error">{state.error}</div>}

        <form onSubmit={submit} className="auth-form">
          <label className="field" htmlFor="email">
            <span>{t("auth.login.email")}</span>
            <input
              id="email"
              type="email"
              autoComplete="email webauthn"
              required
              value={state.email}
              onChange={(event) => state.setEmail(event.target.value)}
            />
          </label>
          <label className="field" htmlFor="password">
            <span
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <span>{t("auth.login.password")}</span>
              <span style={{ color: "var(--mf-primary)", fontWeight: 500 }}>
                Forgot password?
              </span>
            </span>
            <input
              id="password"
              type="password"
              autoComplete="current-password webauthn"
              required
              value={state.password}
              onChange={(event) => state.setPassword(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="btn btn-lg auth-primary"
            disabled={state.busy}
          >
            {state.busy
              ? t("auth.login.signingIn")
              : t("auth.login.passwordAction")}
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>
        <button
          type="button"
          className="btn secondary btn-lg auth-primary"
          disabled={state.busy}
          onClick={() => void state.signInWithPasskey()}
        >
          {t("auth.login.passkey")}
        </button>
        <p className="auth-hint">
          Passkeys are handled by your browser or configured password manager.
        </p>
        <p className="auth-switch">
          {t("auth.login.noAccount")}{" "}
          <Link href="/signup">{t("auth.login.create")}</Link>
        </p>
        <p className="auth-hint">
          Secure authentication · Your mailbox password is never used for
          Mailflow sign-in.
        </p>
      </section>
    </main>
  );
}
