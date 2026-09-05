"use client";

import {
  attentionApi,
  type ReviewCorrection,
  type ReviewInbox,
  type ReviewItem,
} from "@/lib/attention-api";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ padding: "0.8rem 1rem", minWidth: 120 }}>
      <strong style={{ fontSize: "1.35rem" }}>{value}</strong>
      <div className="muted">{label}</div>
    </div>
  );
}

export default function ReviewPage() {
  const [data, setData] = useState<ReviewInbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await attentionApi.review());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load review inbox");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function apply(item: ReviewItem, payload: ReviewCorrection) {
    setBusy(item.id);
    setError(null);
    try {
      await attentionApi.correctReview(item.id, payload);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update review item");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="container">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
        <div>
          <h1>Review</h1>
          <p className="muted">Only exceptions and actionable mail across your authorized mailboxes.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link className="btn secondary" href="/app/notifications">Notifications</Link>
          <Link className="btn secondary" href="/app/daily-summary">Daily summary</Link>
          <Link className="btn secondary" href="/app/mail">Mail</Link>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {data && (
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <Counter label="Review" value={data.counters.review_needed} />
          <Counter label="Urgent" value={data.counters.urgent} />
          <Counter label="Action required" value={data.counters.action_required} />
          <Counter label="Security" value={data.counters.security} />
          <Counter label="Failures" value={data.counters.failures} />
        </div>
      )}

      {!data && !error && <p className="muted">Loading…</p>}
      {data?.items.length === 0 && <div className="card empty">Nothing needs review.</div>}

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {data?.items.map((item) => (
          <article className="card" key={item.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
              <div>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  <span className="pill">{item.review_type}</span>
                  <span className="pill">{item.account_label}</span>
                  <span className="pill">{item.ownership_mode}</span>
                  {item.suspicious_content && <span className="pill off">security</span>}
                </div>
                <h3 style={{ marginBottom: "0.25rem" }}>{item.subject || "(No subject)"}</h3>
                <div className="muted">{item.from_email}</div>
              </div>
              <strong>Priority {item.priority}</strong>
            </div>
            <p>{item.reason}</p>
            <div className="muted" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <span>{item.category}{item.subcategory ? ` / ${item.subcategory}` : ""}</span>
              <span>importance: {item.importance}</span>
              <span>urgency: {item.urgency}</span>
              <span>action: {item.action_required}</span>
              <span>confidence: {Math.round(item.confidence * 100)}%</span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.9rem" }}>
              {item.action_review_required && (
                <>
                  <button className="btn" type="button" disabled={busy === item.id} onClick={() => apply(item, { routing_decision: "approve", remember: false })}>Approve routing</button>
                  <button className="btn secondary" type="button" disabled={busy === item.id} onClick={() => apply(item, { routing_decision: "reject", remember: false })}>Reject routing</button>
                </>
              )}
              <button className="btn secondary" type="button" disabled={busy === item.id} onClick={() => apply(item, { dismiss: true, remember: false })}>Dismiss</button>
              <Link className="btn secondary" href={`/app/mail?account=${encodeURIComponent(item.account_id)}&folder=${encodeURIComponent(item.folder)}&uid=${item.uid}`}>Open message</Link>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
