"use client";

import { SettingsShell, settingsShellStyles as s } from "@/components/settings-shell";
import { authClient, useSession } from "@/lib/auth-client";
import { useEffect, useState } from "react";

export default function ProfileSettingsPage() {
  const session = useSession();
  const user = session.data?.user;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { if (user?.name) setName(user.name); }, [user?.name]);

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const result = await authClient.updateUser({ name });
      if (result.error) throw new Error(result.error.message ?? "Unable to update profile");
      setNotice("Profile saved.");
      await session.refetch();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsShell>
      <section className={s.panel}>
        <header className={s.panelHeader}>
          <h2>Profile & Account</h2>
          <p>Update your personal details and account information.</p>
        </header>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 64, height: 64, display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--mf-surface-muted)", fontSize: 20, fontWeight: 700 }}>
            {initials(user?.name, user?.email)}
          </div>
          <div><strong style={{ display: "block", fontSize: 16 }}>{user?.name || "Mailflow user"}</strong><span className="muted">{user?.email}</span></div>
        </div>

        <div className={s.section}>
          <label className="field">Display Name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
          <label className="field">Email Address<input value={user?.email ?? ""} readOnly disabled /><small>Your login email is managed by the authentication account.</small></label>
          <div className="row">
            <label className="field">Time Zone<input value="Not configurable yet" readOnly disabled /><small>Figma requires a persisted per-user time-zone preference.</small></label>
            <label className="field">Date Format<input value="Not configurable yet" readOnly disabled /><small>Figma requires a persisted per-user date-format preference.</small></label>
          </div>
        </div>

        <div className={s.actions}>
          <button className="btn" type="button" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save Changes"}</button>
          <button className="btn secondary" type="button" disabled={busy} onClick={() => setName(user?.name ?? "")}>Reset</button>
        </div>
        {notice && <div className={notice === "Profile saved." ? "alert ok" : "alert error"}>{notice}</div>}

        <div className={s.section} style={{ borderTop: "1px solid var(--mf-border)", paddingTop: 20 }}>
          <h3 className={s.sectionTitle} style={{ color: "var(--mf-danger)" }}>Danger Zone</h3>
          <div className="alert error">
            <strong>Delete Account & Data</strong><br />
            <span>Figma specifies a destructive account deletion workflow. Mailflow currently has mailbox/data lifecycle primitives, but no complete user-account deletion contract that safely coordinates Better Auth membership, private mailbox ownership and retained data. This action stays unavailable until that backend workflow exists.</span>
          </div>
          <button className="btn destructive" type="button" disabled>Delete Account</button>
        </div>
      </section>
    </SettingsShell>
  );
}

function initials(name?: string | null, email?: string | null): string {
  return (name || email || "M").split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "M";
}
