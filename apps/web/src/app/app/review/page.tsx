"use client";

import {
  type OperationalReviewItem,
  type ReviewCorrection,
  type ReviewInbox,
  type ReviewItem,
  attentionApi,
} from "@/lib/attention-api";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const categories = [
  "work",
  "private",
  "finance",
  "orders",
  "appointments",
  "newsletters",
  "notifications",
  "other",
];
const importanceValues = ["critical", "high", "normal", "low", "unknown"];
const urgencyValues = ["immediate", "today", "this_week", "none", "unknown"];
const actionValues = ["yes", "no", "unknown"];

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ padding: "0.8rem 1rem", minWidth: 120 }}>
      <strong style={{ fontSize: "1.35rem" }}>{value}</strong>
      <div className="muted">{label}</div>
    </div>
  );
}

function ReviewEditor({
  item,
  busy,
  onApply,
}: {
  item: ReviewItem;
  busy: boolean;
  onApply: (payload: ReviewCorrection) => Promise<void>;
}) {
  const [category, setCategory] = useState(item.category);
  const [subcategory, setSubcategory] = useState(item.subcategory ?? "");
  const [importance, setImportance] = useState(item.importance);
  const [urgency, setUrgency] = useState(item.urgency);
  const [actionRequired, setActionRequired] = useState(item.action_required);
  const [destinationFolder, setDestinationFolder] = useState(
    item.destination_folder,
  );
  const [remember, setRemember] = useState(true);

  return (
    <details style={{ marginTop: "0.9rem" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>
        Correct classification
      </summary>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "0.65rem",
          marginTop: "0.75rem",
        }}
      >
        <label>
          <span className="muted">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted">Subcategory</span>
          <input
            value={subcategory}
            maxLength={255}
            onChange={(e) => setSubcategory(e.target.value)}
          />
        </label>
        <label>
          <span className="muted">Importance</span>
          <select
            value={importance}
            onChange={(e) => setImportance(e.target.value)}
          >
            {importanceValues.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted">Urgency</span>
          <select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
            {urgencyValues.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted">Action required</span>
          <select
            value={actionRequired}
            onChange={(e) => setActionRequired(e.target.value)}
          >
            {actionValues.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted">Destination</span>
          <input
            value={destinationFolder}
            maxLength={255}
            onChange={(e) => setDestinationFolder(e.target.value)}
          />
        </label>
      </div>
      <label
        style={{
          display: "flex",
          gap: "0.45rem",
          alignItems: "center",
          marginTop: "0.75rem",
        }}
      >
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        Remember this correction in DecisionMemory
      </label>
      <button
        className="btn"
        type="button"
        disabled={busy}
        style={{ marginTop: "0.75rem" }}
        onClick={() =>
          onApply({
            category,
            subcategory: subcategory || null,
            importance,
            urgency,
            action_required: actionRequired,
            destination_folder: destinationFolder,
            remember,
          })
        }
      >
        Save correction
      </button>
    </details>
  );
}

function OperationalCard({
  item,
  busy,
  onRetry,
}: {
  item: OperationalReviewItem;
  busy: boolean;
  onRetry: () => Promise<void>;
}) {
  return (
    <article className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <span className="pill">{item.source_type}</span>
            <span className="pill">{item.account_label}</span>
            <span className="pill">{item.status}</span>
          </div>
          <h3 style={{ marginBottom: "0.25rem" }}>{item.title}</h3>
        </div>
        <strong>Priority {item.priority}</strong>
      </div>
      <p>{item.reason}</p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {item.retry_available && item.job_id && (
          <button className="btn" type="button" disabled={busy} onClick={onRetry}>
            Retry
          </button>
        )}
        {item.management_url && (
          <Link className="btn secondary" href={item.management_url}>
            Open management
          </Link>
        )}
      </div>
    </article>
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
      setError(
        err instanceof Error ? err.message : "Could not load review inbox",
      );
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
      setError(
        err instanceof Error ? err.message : "Could not update review item",
      );
    } finally {
      setBusy(null);
    }
  }

  async function retryOperational(item: OperationalReviewItem) {
    if (item.source_type !== "backfill_failure" || !item.job_id) return;
    setBusy(item.id);
    setError(null);
    try {
      await attentionApi.retryBackfillFailure(
        item.account_id,
        item.job_id,
        item.id,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not retry item");
    } finally {
      setBusy(null);
    }
  }

  const isEmpty =
    data !== null && data.items.length === 0 && data.operational.length === 0;

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
          <h1>Review</h1>
          <p className="muted">
            Only exceptions and actionable items across your authorized
            mailboxes.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link className="btn secondary" href="/app/notifications">
            Notifications
          </Link>
          <Link className="btn secondary" href="/app/daily-summary">
            Daily summary
          </Link>
          <Link className="btn secondary" href="/app/mail">
            Mail
          </Link>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {data && (
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            marginBottom: "1rem",
          }}
        >
          <Counter label="Review" value={data.counters.review_needed} />
          <Counter label="Urgent" value={data.counters.urgent} />
          <Counter
            label="Action required"
            value={data.counters.action_required}
          />
          <Counter label="Security" value={data.counters.security} />
          <Counter label="Failures" value={data.counters.failures} />
        </div>
      )}

      {!data && !error && <p className="muted">Loading…</p>}
      {isEmpty && <div className="card empty">Nothing needs review.</div>}

      {data && data.operational.length > 0 && (
        <section style={{ marginBottom: "1.25rem" }}>
          <h2>Operational exceptions</h2>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {data.operational.map((item) => (
              <OperationalCard
                key={`${item.source_type}-${item.id}`}
                item={item}
                busy={busy === item.id}
                onRetry={() => retryOperational(item)}
              />
            ))}
          </div>
        </section>
      )}

      {data && data.items.length > 0 && <h2>Message review</h2>}
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {data?.items.map((item) => (
          <article className="card" key={item.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <div>
                <div
                  style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}
                >
                  <span className="pill">{item.review_type}</span>
                  <span className="pill">{item.account_label}</span>
                  <span className="pill">{item.ownership_mode}</span>
                  {item.suspicious_content && (
                    <span className="pill off">security</span>
                  )}
                </div>
                <h3 style={{ marginBottom: "0.25rem" }}>
                  {item.subject || "(No subject)"}
                </h3>
                <div className="muted">{item.from_email}</div>
              </div>
              <strong>Priority {item.priority}</strong>
            </div>
            <p>{item.reason}</p>
            <div
              className="muted"
              style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}
            >
              <span>
                {item.category}
                {item.subcategory ? ` / ${item.subcategory}` : ""}
              </span>
              <span>importance: {item.importance}</span>
              <span>urgency: {item.urgency}</span>
              <span>action: {item.action_required}</span>
              <span>confidence: {Math.round(item.confidence * 100)}%</span>
            </div>

            <ReviewEditor
              item={item}
              busy={busy === item.id}
              onApply={(payload) => apply(item, payload)}
            />

            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                flexWrap: "wrap",
                marginTop: "0.9rem",
              }}
            >
              {item.action_review_required && (
                <>
                  <button
                    className="btn"
                    type="button"
                    disabled={busy === item.id}
                    onClick={() =>
                      apply(item, {
                        routing_decision: "approve",
                        remember: false,
                      })
                    }
                  >
                    Approve routing
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={busy === item.id}
                    onClick={() =>
                      apply(item, {
                        routing_decision: "reject",
                        remember: false,
                      })
                    }
                  >
                    Reject routing
                  </button>
                </>
              )}
              <button
                className="btn secondary"
                type="button"
                disabled={busy === item.id}
                onClick={() => apply(item, { dismiss: true, remember: false })}
              >
                Dismiss
              </button>
              <Link
                className="btn secondary"
                href={`/app/mail?account=${encodeURIComponent(item.account_id)}&folder=${encodeURIComponent(item.folder)}&uid=${item.uid}`}
              >
                Open message
              </Link>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
