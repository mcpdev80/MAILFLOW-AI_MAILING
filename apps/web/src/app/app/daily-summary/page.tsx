"use client";

import {
  type DailySummary,
  type DailySummaryItem,
  attentionApi,
} from "@/lib/attention-api";
import { enumLabel, useI18n } from "@/lib/i18n";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

function SummarySection({
  title,
  items,
}: { title: string; items: DailySummaryItem[] }) {
  const { t } = useI18n();
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
            <strong>{item.subject || t("review.noSubject")}</strong>
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
              <span className="pill">
                {enumLabel(t, "category", item.category)}
              </span>
              <span className="pill">
                {enumLabel(t, "importance", item.importance)}
              </span>
              <span className="pill">
                {enumLabel(t, "urgency", item.urgency)}
              </span>
              {item.action_required === "yes" && (
                <span className="pill">{t("review.actionRequired")}</span>
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
  const { t } = useI18n();

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
          <h1>{t("nav.dailySummary")}</h1>
          <p className="muted">{t("summary.description")}</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link className="btn secondary" href="/app/review">
            {t("nav.review")}
          </Link>
          <Link className="btn secondary" href="/app/notifications">
            {t("nav.notifications")}
          </Link>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {!summary && !error && <p className="muted">{t("common.loading")}</p>}

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
            <span className="pill">
              {t("summary.urgent")} {summary.counters.urgent}
            </span>
            <span className="pill">
              {t("summary.action")} {summary.counters.action_required}
            </span>
            <span className="pill">
              {t("nav.review")} {summary.counters.review_needed}
            </span>
            <span className="pill">
              {t("summary.security")} {summary.counters.security}
            </span>
            <span className="pill">
              {t("review.failures")} {summary.counters.failures}
            </span>
          </div>
          <div className="muted" style={{ marginBottom: "1rem" }}>
            {t("summary.since")} {new Date(summary.since).toLocaleString()} ·{" "}
            {t("summary.generated")} {new Date(summary.generated_at).toLocaleString()}
          </div>
          <div style={{ display: "grid", gap: "1rem" }}>
            <SummarySection title={t("summary.urgent")} items={summary.urgent} />
            <SummarySection
              title={t("summary.action")}
              items={summary.action_required}
            />
            <SummarySection
              title={t("summary.review")}
              items={summary.awaiting_review}
            />
            <SummarySection
              title={t("summary.important")}
              items={summary.important_new}
            />
            <SummarySection
              title={t("summary.failures")}
              items={summary.failures}
            />
          </div>
          {summary.urgent.length === 0 &&
            summary.action_required.length === 0 &&
            summary.awaiting_review.length === 0 &&
            summary.failures.length === 0 && (
              <div className="card empty">{t("summary.empty")}</div>
            )}
        </>
      )}
    </main>
  );
}
