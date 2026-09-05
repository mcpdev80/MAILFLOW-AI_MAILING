"use client";

import {
  type DailySummary,
  type DailySummaryItem,
  attentionApi,
} from "@/lib/attention-api";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

function SummarySection({
  title,
  items,
}: { title: string; items: DailySummaryItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="card">
      <h2>{title}</h2>
      <div style={{ display: "grid", gap: "0.65rem" }}>
        {items.map((item) => (
          <div
            key={`${title}-${item.message_id}`}
            style={{
              borderBottom: "1px solid var(--border, #ddd)",
              paddingBottom: "0.65rem",
            }}
          >
            <strong>{item.subject || "(No subject)"}</strong>
            <div className="muted">
              {item.from_email} · {item.account_label}
            </div>
            <div
              style={{
                display: "flex",
                gap: "0.4rem",
                flexWrap: "wrap",
                marginTop: "0.3rem",
              }}
            >
              <span className="pill">{item.category}</span>
              <span className="pill">{item.importance}</span>
              <span className="pill">{item.urgency}</span>
              {item.action_required === "yes" && (
                <span className="pill">action required</span>
              )}
            </div>
            {item.reason && <p style={{ marginBottom: 0 }}>{item.reason}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function DailySummaryPage() {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSummary(await attentionApi.dailySummary());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load daily summary",
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
          <h1>Daily summary</h1>
          <p className="muted">
            Deterministic digest from persisted Mailflow state — no extra LLM
            pass.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link className="btn secondary" href="/app/review">
            Review
          </Link>
          <Link className="btn secondary" href="/app/notifications">
            Notifications
          </Link>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {!summary && !error && <p className="muted">Loading…</p>}

      {summary && (
        <>
          <div
            style={{
              display: "flex",
              gap: "0.6rem",
              flexWrap: "wrap",
              marginBottom: "1rem",
            }}
          >
            <span className="pill">urgent {summary.counters.urgent}</span>
            <span className="pill">
              action {summary.counters.action_required}
            </span>
            <span className="pill">
              review {summary.counters.review_needed}
            </span>
            <span className="pill">security {summary.counters.security}</span>
            <span className="pill">failures {summary.counters.failures}</span>
          </div>
          <div className="muted" style={{ marginBottom: "1rem" }}>
            Since {new Date(summary.since).toLocaleString()} · generated{" "}
            {new Date(summary.generated_at).toLocaleString()}
          </div>
          <div style={{ display: "grid", gap: "1rem" }}>
            <SummarySection title="Urgent" items={summary.urgent} />
            <SummarySection
              title="Action required"
              items={summary.action_required}
            />
            <SummarySection
              title="Awaiting review"
              items={summary.awaiting_review}
            />
            <SummarySection
              title="Important new mail"
              items={summary.important_new}
            />
            <SummarySection
              title="Failures / blocked actions"
              items={summary.failures}
            />
          </div>
          {summary.urgent.length === 0 &&
            summary.action_required.length === 0 &&
            summary.awaiting_review.length === 0 &&
            summary.failures.length === 0 && (
              <div className="card empty">
                No actionable items in this period.
              </div>
            )}
        </>
      )}
    </main>
  );
}
