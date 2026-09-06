"use client";

import { SettingsShell, settingsShellStyles as s } from "@/components/settings-shell";
import { api } from "@/lib/api";
import type { EmailAccount } from "@/lib/types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function FoldersTagsPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.listAccounts()
      .then((rows) => {
        setAccounts(rows);
        if (rows[0]) setAccountId(rows[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load mailboxes"))
      .finally(() => setLoading(false));
  }, []);

  const account = useMemo(() => accounts.find((item) => item.id === accountId) ?? null, [accounts, accountId]);
  const systemFolders = account
    ? [
        { name: account.inbox_folder || "INBOX", role: "Inbox", detail: "Primary incoming mailbox folder" },
        { name: account.drafts_folder || "Drafts", role: "Drafts", detail: "Draft storage used by Mailflow" },
        { name: account.unclassified_folder || "Unclassified", role: "Unclassified", detail: "Fallback for messages without a safe mapping" },
      ]
    : [];

  return (
    <SettingsShell>
      <section className={s.panel}>
        <header className={s.panelHeader} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
          <div>
            <h2>Folders & Tags</h2>
            <p>Manage the folder structure and classification mappings for each connected mailbox.</p>
          </div>
          <label className="field" style={{ minWidth: 260 }}>
            Mailbox
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {accounts.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}
            </select>
          </label>
        </header>

        {error && <div className="alert error">{error}</div>}
        {loading ? <div className="empty">Loading mailbox structure…</div> : !account ? <div className="empty">Connect a mailbox before configuring folders and tags.</div> : <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
            <div>
              <strong style={{ fontSize: 15 }}>Mapped system folders</strong>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>These values come directly from the mailbox configuration. Discovery never renames or deletes existing folders.</div>
            </div>
            <Link className="btn" href={`/app/settings/folder-discovery?account=${encodeURIComponent(account.id)}`}>Discover structure</Link>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {systemFolders.map((folder) => (
              <div key={folder.role} style={{ display: "grid", gridTemplateColumns: "40px minmax(0,1fr) auto", gap: 16, alignItems: "center", border: "1px solid var(--mf-border)", borderRadius: 8, padding: 16, background: "var(--mf-surface)" }}>
                <span style={{ width: 40, height: 40, display: "grid", placeItems: "center", borderRadius: 20, background: "var(--mf-primary-soft)", color: "var(--mf-primary)", fontWeight: 800 }}>⌑</span>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><strong>{folder.name}</strong><span className="pill">System</span></div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{folder.detail}</div>
                </div>
                <span className="pill ok">Active mapping</span>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "1px solid var(--mf-border)", marginTop: 24, paddingTop: 20, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 20, alignItems: "center" }}>
            <div>
              <strong style={{ fontSize: 15 }}>Smart folder discovery & category mapping</strong>
              <p className="muted" style={{ margin: "5px 0 0", fontSize: 13, lineHeight: 1.5 }}>Mailflow can inspect the real mailbox folder tree, suggest reuse/create decisions and map classification categories. Changes are reviewed before anything is applied.</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Link className="btn secondary" href={`/app/accounts/${account.id}`}>Mailbox details</Link>
              <Link className="btn" href={`/app/settings/folder-discovery?account=${encodeURIComponent(account.id)}`}>Start 3-step setup</Link>
            </div>
          </div>
        </>}
      </section>
    </SettingsShell>
  );
}
