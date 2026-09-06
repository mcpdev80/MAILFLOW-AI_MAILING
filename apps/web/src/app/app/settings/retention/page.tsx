"use client";

import {
  SettingsShell,
  settingsShellStyles as s,
} from "@/components/settings-shell";

export default function RetentionSettingsPage() {
  return (
    <SettingsShell>
      <section className={s.panel}>
        <header className={s.panelHeader}>
          <h2>Data & Retention Policy</h2>
          <p>
            Regulate data compliance, classification retention and export
            boundaries.
          </p>
        </header>

        <div className={s.section}>
          <h3 className={s.sectionTitle}>Retention periods</h3>
          <p className={s.sectionCopy}>
            Figma defines user-configurable retention periods. Mailflow
            currently performs bounded lifecycle cleanup, but does not expose
            these values as authenticated settings.
          </p>
          {[
            ["Keep classified emails", "Backend setting not exposed"],
            ["Keep decision memory", "Backend setting not exposed"],
            ["Keep processing logs", "Backend setting not exposed"],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 20,
              }}
            >
              <strong
                style={{ color: "var(--mf-text-secondary)", fontSize: 13 }}
              >
                {label}
              </strong>
              <select style={{ width: 220 }} disabled value="unavailable">
                <option value="unavailable">{value}</option>
              </select>
            </div>
          ))}
        </div>

        <div
          style={{
            border: "1px solid var(--mf-border)",
            borderRadius: 8,
            background: "var(--mf-bg)",
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              color: "var(--mf-text-secondary)",
              fontSize: 13,
            }}
          >
            <strong style={{ color: "var(--mf-text)" }}>Storage Usage</strong>
            <span>Storage usage metric is not exposed by the API</span>
          </div>
          <div
            style={{
              height: 8,
              marginTop: 10,
              borderRadius: 4,
              background: "var(--mf-surface-muted)",
            }}
          />
        </div>

        <div className={s.section}>
          <h3 className={s.sectionTitle}>Export Data</h3>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn secondary" type="button" disabled>
              Export All Data
            </button>
            <button className="btn secondary" type="button" disabled>
              Export Decision Memory
            </button>
          </div>
          <div className="alert info">
            No authenticated export-job API exists yet. Export actions are
            intentionally disabled instead of returning fabricated files.
          </div>
        </div>

        <div className={s.section}>
          <h3 className={s.sectionTitle} style={{ color: "var(--mf-danger)" }}>
            Danger Zone
          </h3>
          <div className="alert error">
            <strong>Clear All Classification Data</strong>
            <br />
            Figma specifies a destructive purge operation. The current lifecycle
            API is mailbox-oriented and does not expose one safe, audited “clear
            classification database” operation.
          </div>
          <button className="btn destructive" type="button" disabled>
            Clear Database
          </button>
        </div>
      </section>
    </SettingsShell>
  );
}
