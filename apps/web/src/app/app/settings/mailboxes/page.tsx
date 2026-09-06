"use client";

import { SettingsShell, settingsShellStyles as s } from "@/components/settings-shell";
import { api } from "@/lib/api";
import type { EmailAccount } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function MailboxSettingsPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.listAccounts().then(setAccounts).catch((err) => setError(err instanceof Error ? err.message : "Unable to load mailboxes")).finally(() => setLoading(false));
  }, []);

  return (
    <SettingsShell>
      <section className={s.panel}>
        <header className={s.panelHeader} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
          <div><h2>Connected Mailboxes</h2><p>Configure connection pipelines, credentials and indexing bounds for your email accounts.</p></div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link className="btn secondary" href="/app/settings/folders">Folders & Tags</Link>
            <Link className="btn" href="/onboarding?step=mailbox">＋ Add Mailbox</Link>
          </div>
        </header>
        {error && <div className="alert error">{error}</div>}
        {loading ? <div className="empty">Loading mailboxes…</div> : accounts.length === 0 ? <div className="empty">No connected mailboxes yet.</div> : (
          <div style={{ display: "grid", gap: 12 }}>
            {accounts.map((account) => (
              <Link key={account.id} href={`/app/accounts/${account.id}`} style={{ display: "grid", gridTemplateColumns: "40px minmax(0,1fr) auto", gap: 16, alignItems: "center", border: "1px solid var(--mf-border)", borderRadius: 8, background: "var(--mf-surface)", padding: 16, textDecoration: "none" }}>
                <span style={{ width: 40, height: 40, display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--mf-primary-soft)", color: "var(--mf-primary)", fontSize: 18 }}>✉</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}><strong style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{account.username}</strong><span className={`pill ${account.is_active ? "ok" : "off"}`}>{account.is_active ? "Connected" : "Paused"}</span></span>
                  <span style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 4, color: "var(--mf-text-muted)", fontSize: 12 }}>
                    <span>Type: {account.provider_type === "generic_imap" ? "IMAP Sync" : account.provider_type}</span>
                    <span>Privacy: {account.ownership_mode === "shared" ? "Shared" : "Private"}</span>
                    <span>Folder: {account.inbox_folder || "INBOX"}</span>
                  </span>
                </span>
                <span style={{ color: "var(--mf-text-muted)", fontSize: 12, textAlign: "right" }}>Every {account.interval_minutes} min<br />Open details →</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </SettingsShell>
  );
}
