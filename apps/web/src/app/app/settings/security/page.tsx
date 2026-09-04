"use client";

import { authClient } from "@/lib/auth-client";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";

type UserPasskey = {
  id: string;
  name?: string | null;
  createdAt?: Date | string | null;
  deviceType?: string | null;
  backedUp?: boolean | null;
};

function formatDate(value: Date | string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function SecuritySettingsPage() {
  const [passkeys, setPasskeys] = useState<UserPasskey[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsRecentAuth, setNeedsRecentAuth] = useState(false);

  const loadPasskeys = useCallback(async () => {
    const result = await authClient.passkey.listUserPasskeys();
    if (result.error) {
      setError(result.error.message ?? "No se pudieron cargar las passkeys");
      return;
    }
    setPasskeys((result.data ?? []) as UserPasskey[]);
  }, []);

  useEffect(() => {
    void loadPasskeys();
  }, [loadPasskeys]);

  async function addPasskey(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNeedsRecentAuth(false);
    const result = await authClient.passkey.addPasskey({
      name: name.trim() || undefined,
    });
    setBusy(false);
    if (result?.error) {
      setError(result.error.message ?? "No se pudo registrar la passkey");
      return;
    }
    setName("");
    await loadPasskeys();
  }

  async function renamePasskey(passkey: UserPasskey) {
    const nextName = window.prompt(
      "Nombre de la passkey",
      passkey.name ?? "",
    )?.trim();
    if (!nextName) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await authClient.passkey.updatePasskey({
      id: passkey.id,
      name: nextName,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "No se pudo cambiar el nombre");
      return;
    }
    await loadPasskeys();
  }

  async function removePasskey(passkey: UserPasskey) {
    if (!window.confirm(`¿Eliminar la passkey "${passkey.name || "Sin nombre"}"?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    setNeedsRecentAuth(false);
    const result = await authClient.passkey.deletePasskey({ id: passkey.id });
    setBusy(false);
    if (result.error) {
      const message = result.error.message ?? "No se pudo eliminar la passkey";
      setError(message);
      setNeedsRecentAuth(message.includes("Recent authentication required"));
      return;
    }
    await loadPasskeys();
  }

  return (
    <main className="container">
      <h1>Seguridad</h1>
      <p className="muted">
        Las passkeys autentican tu usuario existente de MailFlow. No cambian los
        permisos de buzones ni sustituyen credenciales IMAP, OAuth o claves de API.
      </p>

      {error && <div className="alert error">{error}</div>}
      {needsRecentAuth && (
        <div className="alert">
          Vuelve a autenticarte antes de eliminar métodos de acceso.{" "}
          <Link href="/login?redirect=/app/settings/security">Iniciar sesión de nuevo</Link>
        </div>
      )}

      <section className="card">
        <h2>Registrar una passkey</h2>
        <form onSubmit={addPasskey}>
          <div className="field">
            <label htmlFor="passkey-name">Nombre del dispositivo</label>
            <input
              id="passkey-name"
              value={name}
              maxLength={100}
              placeholder="Ej. Portátil, teléfono o llave USB"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <button type="submit" className="btn" disabled={busy}>
            Añadir passkey
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Passkeys registradas</h2>
        {passkeys.length === 0 ? (
          <p className="muted">Todavía no hay passkeys registradas.</p>
        ) : (
          <div>
            {passkeys.map((passkey) => (
              <div key={passkey.id} className="card">
                <strong>{passkey.name || "Passkey sin nombre"}</strong>
                <p className="muted">
                  Creada: {formatDate(passkey.createdAt)} · Tipo: {passkey.deviceType || "—"}
                  {passkey.backedUp ? " · Sincronizada/resguardada" : ""}
                </p>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => renamePasskey(passkey)}
                >
                  Renombrar
                </button>{" "}
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => removePasskey(passkey)}
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Recuperación</h2>
        <p>
          Mantén más de una passkey cuando sea posible. El inicio de sesión con
          email y contraseña permanece disponible como vía de recuperación durante
          la migración. MailFlow no elimina automáticamente tu contraseña al añadir
          una passkey.
        </p>
      </section>
    </main>
  );
}
