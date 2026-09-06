"use client";

import type { DailySummary, DailySummaryItem } from "@/lib/attention-api";
import { enumLabel, useI18n } from "@/lib/i18n";
import Link from "next/link";

type DailySummaryUiProps = {
  summary: DailySummary | null;
  error: string | null;
  isEmpty: boolean;
  onReload: () => Promise<void>;
};

export function DailySummaryUi(props: DailySummaryUiProps) {
  const { t } = useI18n();
  return (
    <main style={{ width: "100%", padding: 24 }}>
      {props.error && (
        <div
          className="alert error"
          role="alert"
          style={{
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
          }}
        >
          <span>{props.error}</span>
          <button
            className="btn secondary"
            type="button"
            onClick={() => void props.onReload()}
          >
            {t("review.retry")}
          </button>
        </div>
      )}
      {!props.summary && !props.error && (
        <div className="empty">{t("common.loading")}</div>
      )}
      {props.summary && (
        <SummaryContent summary={props.summary} isEmpty={props.isEmpty} />
      )}
    </main>
  );
}

function SummaryContent({
  summary,
  isEmpty,
}: { summary: DailySummary; isEmpty: boolean }) {
  const { t, locale } = useI18n();
  const generated = new Date(summary.generated_at);
  const unique = uniqueItems(summary);
  const categoryCounts = new Map<string, number>();
  for (const item of unique)
    categoryCounts.set(
      item.category,
      (categoryCounts.get(item.category) ?? 0) + 1,
    );
  const categories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);
  const maxCategory = Math.max(1, ...categories.map(([, count]) => count));

  return (
    <>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 20,
          marginBottom: 18,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>
            {t("nav.dailySummary")} —{" "}
            {generated.toLocaleDateString(locale, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            {t("summary.description")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn secondary" href="/app/review">
            {t("nav.review")}
          </Link>
          <Link className="btn secondary" href="/app/notifications">
            {t("nav.notifications")}
          </Link>
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,minmax(0,1fr))",
          gap: 16,
          marginBottom: 18,
        }}
      >
        <Kpi
          label="Messages surfaced"
          value={unique.length}
          note="Unique items in this summary"
        />
        <Kpi
          label={t("summary.action")}
          value={summary.counters.action_required}
          note="Needs a response or action"
        />
        <Kpi
          label={t("nav.review")}
          value={summary.counters.review_needed}
          note="Human review requested"
          highlight
        />
        <Kpi
          label={t("review.failures")}
          value={summary.counters.failures}
          note="Processing exceptions"
          danger={summary.counters.failures > 0}
        />
      </section>

      <div className="muted" style={{ fontSize: 12, marginBottom: 18 }}>
        {t("summary.since")} {new Date(summary.since).toLocaleString(locale)} ·{" "}
        {t("summary.generated")} {generated.toLocaleString(locale)}
      </div>

      {isEmpty ? (
        <div className="empty">{t("summary.empty")}</div>
      ) : (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
              gap: 16,
              marginBottom: 18,
            }}
          >
            <div
              style={{
                border: "1px solid var(--mf-border)",
                borderRadius: 8,
                background: "var(--mf-surface)",
                padding: 20,
              }}
            >
              <h2 style={{ margin: "0 0 16px", fontSize: 14 }}>
                Category Breakdown
              </h2>
              <div style={{ display: "grid", gap: 13 }}>
                {categories.map(([category, count]) => (
                  <div key={category}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        fontSize: 13,
                      }}
                    >
                      <span>• {enumLabel(t, "category", category)}</span>
                      <strong>
                        {count} email{count === 1 ? "" : "s"} (
                        {Math.round((count / unique.length) * 100)}%)
                      </strong>
                    </div>
                    <div
                      style={{
                        height: 6,
                        marginTop: 6,
                        borderRadius: 3,
                        background: "var(--mf-surface-muted)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${(count / maxCategory) * 100}%`,
                          height: "100%",
                          background: "var(--mf-text-muted)",
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div
              style={{
                border: "1px solid var(--mf-border)",
                borderRadius: 8,
                background: "var(--mf-surface)",
                padding: 20,
              }}
            >
              <h2 style={{ margin: "0 0 12px", fontSize: 14 }}>
                Activity Statistics
              </h2>
              <Stat label="Unique messages surfaced" value={unique.length} />
              <Stat
                label={t("summary.urgent")}
                value={summary.counters.urgent}
              />
              <Stat
                label={t("summary.action")}
                value={summary.counters.action_required}
              />
              <Stat
                label={t("summary.security")}
                value={summary.counters.security}
              />
              <Stat
                label={t("summary.review")}
                value={summary.counters.review_needed}
                accent
              />
            </div>
          </section>
          <SummarySections summary={summary} />
        </>
      )}
    </>
  );
}

function Kpi({
  label,
  value,
  note,
  highlight = false,
  danger = false,
}: {
  label: string;
  value: number;
  note: string;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      style={{
        border: `1.5px solid ${highlight ? "var(--mf-primary)" : danger ? "var(--mf-danger)" : "var(--mf-border)"}`,
        borderRadius: 8,
        background: "var(--mf-surface)",
        padding: 20,
        boxShadow: "var(--mf-shadow-card)",
      }}
    >
      <div className="muted" style={{ fontSize: 13 }}>
        {label}
      </div>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "baseline",
          marginTop: 10,
        }}
      >
        <strong style={{ fontSize: 28 }}>{value}</strong>
        <span
          style={{
            color: danger
              ? "var(--mf-danger)"
              : highlight
                ? "var(--mf-warning)"
                : "var(--mf-text-muted)",
            fontSize: 12,
          }}
        >
          {note}
        </span>
      </div>
    </div>
  );
}
function Stat({
  label,
  value,
  accent = false,
}: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "1px solid var(--mf-surface-muted)",
        padding: "12px 0",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--mf-text-secondary)" }}>{label}</span>
      <strong
        style={{ color: accent ? "var(--mf-primary)" : "var(--mf-text)" }}
      >
        {value}
      </strong>
    </div>
  );
}

function uniqueItems(summary: DailySummary): DailySummaryItem[] {
  const map = new Map<string, DailySummaryItem>();
  for (const group of [
    summary.urgent,
    summary.action_required,
    summary.awaiting_review,
    summary.important_new,
    summary.failures,
  ])
    for (const item of group)
      map.set(`${item.account_id}:${item.message_id}`, item);
  return [...map.values()];
}

function SummarySections({ summary }: { summary: DailySummary }) {
  const { t } = useI18n();
  const groups = [
    [t("summary.urgent"), summary.urgent],
    [t("summary.action"), summary.action_required],
    [t("summary.review"), summary.awaiting_review],
    [t("summary.important"), summary.important_new],
    [t("summary.failures"), summary.failures],
  ] as const;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {groups.map(
        ([title, items]) =>
          items.length > 0 && (
            <SummarySection key={title} title={title} items={items} />
          ),
      )}
    </div>
  );
}
function SummarySection({
  title,
  items,
}: { title: string; items: DailySummaryItem[] }) {
  return (
    <section
      style={{
        border: "1px solid var(--mf-border)",
        borderRadius: 8,
        background: "var(--mf-surface)",
        padding: "16px 20px",
      }}
    >
      <h2 style={{ margin: "0 0 8px", fontSize: 14 }}>{title}</h2>
      {items.map((item, index) => (
        <SummaryItemRow
          key={`${item.account_id}-${item.message_id}`}
          item={item}
          bordered={index > 0}
        />
      ))}
    </section>
  );
}
function SummaryItemRow({
  item,
  bordered,
}: { item: DailySummaryItem; bordered: boolean }) {
  const { t } = useI18n();
  return (
    <article
      style={{
        borderTop: bordered ? "1px solid var(--mf-surface-muted)" : undefined,
        padding: "11px 0",
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 14 }}
      >
        <div>
          <strong style={{ fontSize: 13 }}>
            {item.subject || t("review.noSubject")}
          </strong>
          <div className="muted" style={{ marginTop: 3, fontSize: 12 }}>
            {item.from_email} · {item.account_label}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <span className="pill">
            {enumLabel(t, "category", item.category)}
          </span>
          <span className="pill">
            {enumLabel(t, "importance", item.importance)}
          </span>
          <span className="pill">{enumLabel(t, "urgency", item.urgency)}</span>
        </div>
      </div>
      {item.reason && (
        <p
          style={{
            margin: "8px 0 0",
            color: "var(--mf-text-secondary)",
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          {item.reason}
        </p>
      )}
    </article>
  );
}
