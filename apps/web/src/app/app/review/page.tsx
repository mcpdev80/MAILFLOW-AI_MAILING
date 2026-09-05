"use client";

import {
  type OperationalReviewItem,
  type ReviewCorrection,
  type ReviewInbox,
  type ReviewItem,
  attentionApi,
} from "@/lib/attention-api";
import { enumLabel, useI18n } from "@/lib/i18n";
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
  const { t } = useI18n();

  return (
    <details style={{ marginTop: "0.9rem" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>
        {t("review.correct")}
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
          <span className="muted">{t("review.category")}</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((value) => (
              <option key={value} value={value}>
                {enumLabel(t, "category", value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted">{t("review.subcategory")}</span>
          <input
            value={subcategory}
            maxLength={255}
            onChange={(e) => setSubcategory(e.target.value)}
          />
        </label>
        <label>
          <span className="muted">{t("review.importance")}</span>
          <select
            value={importance}
            onChange={(e) => setImportance(e.target.value)}
          >
            {importanceValues.map((value) => (
              <option key={value} value={value}>
                {enumLabel(t, "importance", value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted">{t("review.urgency")}</span>
          <select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
            {urgencyValues.map((value) => (
              <option key={value} value={value}>
                {enumLabel(t, "urgency", value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted">{t("review.actionRequired")}</span>
          <select
            value={actionRequired}
            onChange={(e) => setActionRequired(e.target.value)}
          >
            {actionValues.map((value) => (
              <option key={value} value={value}>
                {enumLabel(t, "action_required", value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted">{t("review.destination")}</span>
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
        {t("review.remember")}
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
        {t("review.saveCorrection")}
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
  const { t } = useI18n();
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
        <strong>
          {t("review.priority")} {item.priority}
        </strong>
      </div>
      <p>{item.reason}</p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {item.retry_available && item.job_id && (
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={onRetry}
          >
            {t("review.retry")}
          </button>
        )}
        {item.management_url && (
          <Link className="btn secondary" href={item.management_url}>
            {t("review.openManagement")}
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
  const { t } = useI18n();

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
          <h1>{t("review.title")}</h1>
          <p className="muted">{t("review.description")}</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link className="btn secondary" href="/app/notifications">
            {t("nav.notifications")}
          </Link>
          <Link className="btn secondary" href="/app/daily-summary">
            {t("nav.dailySummary")}
          </Link>
          <Link className="btn secondary" href="/app/mail">
            {t("nav.mail")}
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
          <Counter
            label={t("review.title")}
            value={data.counters.review_needed}
          />
          <Counter label={t("review.urgent")} value={data.counters.urgent} />
          <Counter
            label={t("review.actionRequired")}
            value={data.counters.action_required}
          />
          <Counter
            label={t("review.security")}
            value={data.counters.security}
          />
          <Counter
            label={t("review.failures")}
            value={data.counters.failures}
          />
        </div>
      )}

      {!data && !error && <p className="muted">{t("common.loading")}</p>}
      {isEmpty && <div className="card empty">{t("review.empty")}</div>}

      {data && data.operational.length > 0 && (
        <section style={{ marginBottom: "1.25rem" }}>
          <h2>{t("review.operational")}</h2>
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

      {data && data.items.length > 0 && <h2>{t("review.messages")}</h2>}
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
                    <span className="pill off">{t("review.security")}</span>
                  )}
                </div>
                <h3 style={{ marginBottom: "0.25rem" }}>
                  {item.subject || t("review.noSubject")}
                </h3>
                <div className="muted">{item.from_email}</div>
              </div>
              <strong>
                {t("review.priority")} {item.priority}
              </strong>
            </div>
            <p>{item.reason}</p>
            <div
              className="muted"
              style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}
            >
              <span>
                {enumLabel(t, "category", item.category)}
                {item.subcategory ? ` / ${item.subcategory}` : ""}
              </span>
              <span>
                {t("review.importance")}:{" "}
                {enumLabel(t, "importance", item.importance)}
              </span>
              <span>
                {t("review.urgency")}: {enumLabel(t, "urgency", item.urgency)}
              </span>
              <span>
                {t("review.actionRequired")}:{" "}
                {enumLabel(t, "action_required", item.action_required)}
              </span>
              <span>
                {t("review.confidence")}: {Math.round(item.confidence * 100)}%
              </span>
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
                    {t("review.approveRouting")}
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
                    {t("review.rejectRouting")}
                  </button>
                </>
              )}
              <button
                className="btn secondary"
                type="button"
                disabled={busy === item.id}
                onClick={() => apply(item, { dismiss: true, remember: false })}
              >
                {t("review.dismiss")}
              </button>
              <Link
                className="btn secondary"
                href={`/app/mail?account=${encodeURIComponent(item.account_id)}&folder=${encodeURIComponent(item.folder)}&uid=${item.uid}`}
              >
                {t("review.openMessage")}
              </Link>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
