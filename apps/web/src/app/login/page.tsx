"use client";

import { authClient } from "@/lib/auth-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

function redirectTarget(): string {
  if (typeof window === "undefined") {
    return "/app/dashboard";
  }
  return (
    new URLSearchParams(window.location.search).get("redirect") ||
    "/app/dashboard"
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function startConditionalPasskey() {
      if (
        typeof PublicKeyCredential === "undefined" ||
        typeof PublicKeyCredential.isConditionalMediationAvailable !== "function" ||
        !(await PublicKeyCredential.isConditionalMediationAvailable())
      ) {
        return;
      }

      const result = await authClient.signIn.passkey({ autoFill: true });
      if (!cancelled && !result.error) {
        router.push(redirectTarget());
      }
    }

    void startConditionalPasskey();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function signInWithPasskey() {
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.passkey();
    if (err) {
      setError(err.message ?? "No se pudo iniciar sesión con la passkey");
      setBusy(false);
      return;
    }
    router.push(redirectTarget());
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.email({ email, password });
    if (err) {
      setError(err.message ?? "No se pudo iniciar sesión");
      setBusy(false);
      return;
    }
    router.push(redirectTarget());
  }

  return (
    <main className="container">
      <h1>Iniciar sesión</h1>
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={signInWithPasskey}
        >
          Iniciar sesión con passkey
        </button>
        <p className="muted">
          Usa Windows Hello, Touch ID, tu teléfono o una llave de seguridad.
        </p>
      </div>

      <form onSubmit={onSubmit} className="card">
        <p className="muted">
          El acceso por email y contraseña sigue disponible para migración y
          recuperación.
        </p>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email webauthn"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password webauthn"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "Entrando…" : "Entrar con contraseña"}
        </button>
      </form>
      <p className="muted">
        ¿No tienes cuenta? <Link href="/signup">Crear cuenta</Link>
      </p>
    </main>
  );
}
