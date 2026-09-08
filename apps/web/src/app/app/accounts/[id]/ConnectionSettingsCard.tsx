"use client";

import { ApiError, api } from "@/lib/api";
import type { EmailAccount, SmtpSecurity } from "@/lib/types";
import { useEffect, useState } from "react";

type Props = {
  account: EmailAccount;
  canManage: boolean;
  onSaved: (account: EmailAccount) => void;
};

type FormState = {
  imap_host: string;
  imap_port: number;
  use_ssl: boolean;
  username: string;
  password: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: SmtpSecurity;
  smtp_username: string;
  smtp_password: string;
  interval_minutes: number;
  is_active: boolean;
};

export function ConnectionSettingsCard({ account, canManage, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => fromAccount(account));

  useEffect(() => {
    if (!editing) setForm(fromAccount(account));
  }, [account, editing]);

  const genericImap = ["imap", "generic_imap"].includes(account.provider_type);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        imap_host: form.imap_host.trim(),
        imap_port: form.imap_port,
        use_ssl: form.use_ssl,
        username: form.username.trim(),
        smtp_host: form.smtp_host.trim() || null,
        smtp_port: form.smtp_port,
        smtp_security: form.smtp_security,
        smtp_username: form.smtp_username.trim() || null,
        interval_minutes: form.interval_minutes,
        is_active: form.is_active,
        ...(form.password ? { password: form.password } : {}),
        ...(form.smtp_password ? { smtp_password: form.smtp_password } : {}),
      };
      const updated = await api.updateAccount(account.id, payload);
      onSaved(updated);
      setForm(fromAccount(updated));
      setNotice("IMAP und SMTP wurden erfolgreich geprüft. Einstellungen gespeichert.");
      setEditing(false);
    } catch (err) {
      setError(connectionErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      style={{
        border: "1px solid var(--mf-border)",
        borderRadius: 8,
        padding: 24,
        background: "var(--mf-surface)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Verbindungseinstellungen</h2>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
            Änderungen an IMAP oder SMTP werden vor dem Speichern zwingend geprüft.
          </p>
        </div>
        {canManage && genericImap && !editing && (
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              setError(null);
              setNotice(null);
              setEditing(true);
            }}
          >
            Bearbeiten
          </button>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      {!genericImap ? (
        <p className="muted" style={{ margin: 0 }}>
          Dieses Konto wird über {account.provider_type} verwaltet. Server- und Zugangsdaten werden durch den OAuth-Provider gesteuert.
        </p>
      ) : editing ? (
        <div style={{ display: "grid", gap: 20 }}>
          <ConnectionSection title="Eingehende Mail (IMAP)">
            <Field label="IMAP Host">
              <input value={form.imap_host} onChange={(e) => update("imap_host", e.target.value)} />
            </Field>
            <Field label="Port">
              <input
                type="number"
                min={1}
                max={65535}
                value={form.imap_port}
                onChange={(e) => update("imap_port", Number(e.target.value))}
              />
            </Field>
            <Field label="Sicherheit">
              <select
                value={form.use_ssl ? "ssl" : "plain"}
                onChange={(e) => update("use_ssl", e.target.value === "ssl")}
              >
                <option value="ssl">SSL/TLS</option>
                <option value="plain">Keine</option>
              </select>
            </Field>
            <Field label="Benutzername">
              <input value={form.username} onChange={(e) => update("username", e.target.value)} />
            </Field>
            <Field label="Neues Passwort">
              <input
                type="password"
                value={form.password}
                placeholder="Leer lassen = unverändert"
                autoComplete="new-password"
                onChange={(e) => update("password", e.target.value)}
              />
            </Field>
          </ConnectionSection>

          <ConnectionSection title="Ausgehende Mail (SMTP)">
            <Field label="SMTP Host">
              <input value={form.smtp_host} onChange={(e) => update("smtp_host", e.target.value)} />
            </Field>
            <Field label="Port">
              <input
                type="number"
                min={1}
                max={65535}
                value={form.smtp_port}
                onChange={(e) => update("smtp_port", Number(e.target.value))}
              />
            </Field>
            <Field label="Sicherheit">
              <select
                value={form.smtp_security}
                onChange={(e) => update("smtp_security", e.target.value as SmtpSecurity)}
              >
                <option value="starttls">STARTTLS</option>
                <option value="ssl">SSL/TLS</option>
                <option value="plain">Keine</option>
              </select>
            </Field>
            <Field label="Benutzername">
              <input
                value={form.smtp_username}
                placeholder={form.username}
                onChange={(e) => update("smtp_username", e.target.value)}
              />
            </Field>
            <Field label="Neues Passwort">
              <input
                type="password"
                value={form.smtp_password}
                placeholder="Leer lassen = unverändert"
                autoComplete="new-password"
                onChange={(e) => update("smtp_password", e.target.value)}
              />
            </Field>
          </ConnectionSection>

          <ConnectionSection title="Synchronisation">
            <Field label="Intervall (Minuten)">
              <input
                type="number"
                min={1}
                max={1440}
                value={form.interval_minutes}
                onChange={(e) => update("interval_minutes", Number(e.target.value))}
              />
            </Field>
            <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => update("is_active", e.target.checked)}
                style={{ width: 16, minHeight: 16 }}
              />
              Konto aktiv
            </label>
          </ConnectionSection>

          <div className="alert">
            Beim Speichern werden DNS, TLS, IMAP-Anmeldung und INBOX-Zugriff sowie SMTP-Verbindung, TLS und Anmeldung geprüft. Es wird keine Testmail versendet.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" type="button" disabled={busy} onClick={() => void save()}>
              {busy ? "Prüfe Verbindung…" : "Prüfen & speichern"}
            </button>
            <button
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                setForm(fromAccount(account));
                setError(null);
                setEditing(false);
              }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 20 }}>
          <ReadOnlyBlock title="IMAP">
            <Row label="Server" value={`${account.imap_host}:${account.imap_port}`} />
            <Row label="Sicherheit" value={account.use_ssl ? "SSL/TLS" : "Keine"} />
            <Row label="Benutzername" value={account.username} />
          </ReadOnlyBlock>
          <ReadOnlyBlock title="SMTP">
            <Row label="Server" value={account.smtp_host ? `${account.smtp_host}:${account.smtp_port ?? ""}` : "Nicht konfiguriert"} />
            <Row label="Sicherheit" value={securityLabel(account.smtp_security)} />
            <Row label="Benutzername" value={account.smtp_username || account.username} />
          </ReadOnlyBlock>
        </div>
      )}
    </section>
  );
}

function fromAccount(account: EmailAccount): FormState {
  return {
    imap_host: account.imap_host,
    imap_port: account.imap_port,
    use_ssl: account.use_ssl,
    username: account.username,
    password: "",
    smtp_host: account.smtp_host ?? "",
    smtp_port: account.smtp_port ?? 587,
    smtp_security: account.smtp_security,
    smtp_username: account.smtp_username ?? account.username,
    smtp_password: "",
    interval_minutes: account.interval_minutes,
    is_active: account.is_active,
  };
}

function ConnectionSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>{title}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <span>{label}</span>
      {children}
    </div>
  );
}

function ReadOnlyBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: "1px solid var(--mf-border)", paddingTop: 12 }}>
      <strong style={{ fontSize: 13 }}>{title}</strong>
      <div style={{ display: "grid", gap: 9, marginTop: 10 }}>{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13 }}>
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function securityLabel(value: SmtpSecurity): string {
  if (value === "starttls") return "STARTTLS";
  if (value === "ssl") return "SSL/TLS";
  return "Keine";
}

function connectionErrorMessage(error: unknown): string {
  const code = error instanceof ApiError || error instanceof Error ? error.message : "mailbox_update_failed";
  const messages: Record<string, string> = {
    imap_dns_failed: "Der IMAP-Servername konnte nicht aufgelöst werden.",
    imap_tls_failed: "Die TLS-Verbindung zum IMAP-Server ist fehlgeschlagen.",
    imap_auth_failed: "Die IMAP-Anmeldung ist fehlgeschlagen. Benutzername oder Passwort prüfen.",
    imap_connection_timeout: "Der IMAP-Server hat nicht rechtzeitig geantwortet.",
    imap_connection_failed: "Die Verbindung zum IMAP-Server ist fehlgeschlagen.",
    smtp_dns_failed: "Der SMTP-Servername konnte nicht aufgelöst werden.",
    smtp_tls_failed: "Die TLS-Verbindung zum SMTP-Server ist fehlgeschlagen.",
    smtp_auth_failed: "Die SMTP-Anmeldung ist fehlgeschlagen. Benutzername oder Passwort prüfen.",
    smtp_auth_not_supported: "Der SMTP-Server unterstützt die konfigurierte Anmeldung nicht.",
    smtp_starttls_unavailable: "Der SMTP-Server bietet STARTTLS nicht an.",
    smtp_connection_timeout: "Der SMTP-Server hat nicht rechtzeitig geantwortet.",
    smtp_connection_failed: "Die Verbindung zum SMTP-Server ist fehlgeschlagen.",
    smtp_required_for_generic_account: "Für ein IMAP-Konto muss auch ein SMTP-Server konfiguriert sein.",
  };
  return messages[code] ?? code;
}
