"use client";

import {
  type NotificationCenter,
  type NotificationPreference,
  attentionApi,
} from "@/lib/attention-api";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export default function NotificationsPage() {
  const [center, setCenter] = useState<NotificationCenter | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreference | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [nextCenter, nextPreferences] = await Promise.all([
        attentionApi.notifications(),
        attentionApi.preferences(),
      ]);
      setCenter(nextCenter);
      setPreferences(nextPreferences);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load notifications",
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id: string) {
    await attentionApi.markRead(id);
    await load();
  }

  async function savePreferences() {
    if (!preferences) return;
    setSaving(true);
    try {
      await attentionApi.savePreferences(preferences);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save preferences",
      );
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: keyof NotificationPreference) {
    if (!preferences || typeof preferences[key] !== "boolean") return;
    setPreferences({ ...preferences, [key]: !preferences[key] });
  }

  return (
    <main className="container">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          alignItems: "center",
        }}
      >
        <div>
          <h1>Notifications</h1>
          <p className="muted">Exceptions and actionable events only.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link className="btn secondary" href="/app/review">
            Review
          </Link>
          <Link className="btn secondary" href="/app/daily-summary">
            Daily summary
          </Link>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {preferences && (
        <section className="card" style={{ marginBottom: "1rem" }}>
          <h3>Preferences</h3>
          <div
            style={{ display: "grid", gap: "0.55rem", marginBottom: "0.75rem" }}
          >
            {(
              [
                ["urgent_enabled", "Urgent / action-required"],
                ["security_review_enabled", "Security / review"],
                ["jobs_enabled", "Job completion / failure"],
                ["mailbox_health_enabled", "Mailbox health"],
                ["daily_summary_enabled", "Daily summary"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
              >
                <input
                  type="checkbox"
                  checked={preferences[key]}
                  onChange={() => toggle(key)}
                />
                {label}
              </label>
            ))}
          </div>
          <button
            className="btn"
            type="button"
            disabled={saving}
            onClick={savePreferences}
          >
            {saving ? "Saving…" : "Save preferences"}
          </button>
        </section>
      )}

      <section>
        <h2>Inbox {center ? `(${center.unread} unread)` : ""}</h2>
        {!center && !error && <p className="muted">Loading…</p>}
        {center?.notifications.length === 0 && (
          <div className="card empty">No notifications.</div>
        )}
        <div style={{ display: "grid", gap: "0.65rem" }}>
          {center?.notifications.map((item) => (
            <article
              className="card"
              key={item.id}
              style={{ opacity: item.read_at ? 0.72 : 1 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                }}
              >
                <div>
                  <span className="pill">{item.severity}</span>
                  <h3 style={{ marginBottom: "0.25rem" }}>{item.title}</h3>
                  <div>{item.body}</div>
                  <div className="muted" style={{ marginTop: "0.4rem" }}>
                    {new Date(item.created_at).toLocaleString()}
                  </div>
                </div>
                {!item.read_at && (
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => markRead(item.id)}
                  >
                    Mark read
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
