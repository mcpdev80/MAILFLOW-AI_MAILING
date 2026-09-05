"use client";

import { ApiError, api } from "@/lib/api";
import type { EmailAccount, SmtpSecurity } from "@/lib/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function SmtpSettingsPage() {
  const params = useParams<{ id: string }>();
  const [account, setAccount] = useState<EmailAccount | null>(null);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [security, setSecurity] = useState<SmtpSecurity>("starttls");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getAccount(params.id)
      .then((value) => {
        if (cancelled) return;
        setAccount(value);
        setHost(value.smtp_host ?? "");
        setPort(String(value.smtp_port ?? 587));
        setSecurity(value.smtp_security);
        setUsername(value.smtp_username ?? value.username);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load SMTP settings");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function save() {
    if (!account) return;
    const parsedPort = Number(port);
    if (!host.trim() || !Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      setError("Enter a valid SMTP host and port.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.updateAccount(account.id, {
        smtp_host: host.trim(),
        smtp_port: parsedPort,
        smtp_security: security,
        smtp_username: username.trim() || account.username,
        ...(password ? { smtp_password: password } : {}),
      });
      setAccount(updated);
      setPassword("");
      setNotice("SMTP settings saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save SMTP settings");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container" style={{ maxWidth: "720px" }}>
      <p>
        <Link href={`/app/accounts/${params.id}`}>← Mailbox</Link>
      </p>
      <h1>Outgoing mail</h1>
      <p className="muted">
        Configure SMTP for generic IMAP accounts. Gmail and Microsoft OAuth accounts use their provider SMTP service automatically unless you override it here.
      </p>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      {account && (
        <div className="card">
          <div className="field">
            <label htmlFor="smtp-host">SMTP host</label>
            <input id="smtp-host" value={host} onChange={(event) => setHost(event.target.value)} placeholder="smtp.example.com" />
          </div>
          <div className="field">
            <label htmlFor="smtp-port">Port</label>
            <input id="smtp-port" type="number" min={1} max={65535} value={port} onChange={(event) => setPort(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="smtp-security">Connection security</label>
            <select id="smtp-security" value={security} onChange={(event) => setSecurity(event.target.value as SmtpSecurity)}>
              <option value="starttls">STARTTLS</option>
              <option value="ssl">TLS / SSL</option>
              <option value="plain">Plain connection</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="smtp-username">SMTP username</label>
            <input id="smtp-username" value={username} onChange={(event) => setUsername(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="smtp-password">SMTP password</label>
            <input id="smtp-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={account.has_smtp_password ? "Configured — enter to replace" : "Leave empty to reuse mailbox password"} />
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              Stored encrypted and never returned by the API. If empty, generic SMTP falls back to the mailbox password.
            </span>
          </div>
          <button type="button" className="btn" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save outgoing mail settings"}
          </button>
        </div>
      )}
    </main>
  );
}
