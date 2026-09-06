"use client";

import { SettingsShell, settingsShellStyles as s } from "@/components/settings-shell";
import { api } from "@/lib/api";
import type { EmailAccount } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

export default function RulesSettingsPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setAccounts(await api.listAccounts()); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to load mailbox policies"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function update(account: EmailAccount, patch: { move_policy?: "off" | "review" | "automatic"; archive_policy?: "off" | "review" | "automatic" }) {
    setBusyId(account.id); setError(null);
    try { await api.updateAccount(account.id, patch); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to update mailbox policy"); }
    finally { setBusyId(null); }
  }

  return (
    <SettingsShell>
      <section className={s.panel}>
        <header className={s.panelHeader}>
          <h2>Rules & Actions</h2>
          <p>Configure the real mailbox action policies available in the current Mailflow backend.</p>
        </header>

        {error && <div className="alert error">{error}</div>}
        <div className={s.section}>
          <h3 className={s.sectionTitle}>Mailbox action policies</h3>
          <p className={s.sectionCopy}>Move and archive policies are evaluated after classification. Delete and send remain explicit-user-action only.</p>
          {accounts.length === 0 ? <div className="empty">No mailboxes configured.</div> : (
            <div style={{ display: "grid", gap: 12 }}>
              {accounts.map((account) => (
                <div key={account.id} style={{ display: "grid", gridTemplateColumns: "minmax(180px,1fr) 190px 190px", gap: 16, alignItems: "center", border: "1px solid var(--mf-border)", borderRadius: 8, padding: 16 }}>
                  <div><strong>{account.username}</strong><div className="muted" style={{ marginTop: 3, fontSize: 12 }}>Confidence threshold: {Math.round((account.action_confidence_threshold ?? .85) * 100)}%</div></div>
                  <label className="field">Move to folders<select disabled={busyId === account.id} value={account.move_policy} onChange={(e) => void update(account, { move_policy: e.target.value as "off" | "review" | "automatic" })}><option value="automatic">Automatic when safe</option><option value="review">Review first</option><option value="off">Off</option></select></label>
                  <label className="field">Archive<select disabled={busyId === account.id} value={account.archive_policy} onChange={(e) => void update(account, { archive_policy: e.target.value as "off" | "review" | "automatic" })}><option value="review">Review first</option><option value="automatic">Automatic when safe</option><option value="off">Off</option></select></label>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={s.section} style={{ borderTop: "1px solid var(--mf-border)", paddingTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
            <div><h3 className={s.sectionTitle}>Conditional automation rules</h3><p className={s.sectionCopy}>Figma defines arbitrary “if condition → action” rules with enable/disable state and last-run information.</p></div>
            <button className="btn" type="button" disabled>＋ Create Rule</button>
          </div>
          <div className="alert info">The current backend does not have a persisted generic rule engine or CRUD contract for the Figma rule examples. I am not showing fake rules. This control stays disabled until that domain model is defined.</div>
        </div>
      </section>
    </SettingsShell>
  );
}
