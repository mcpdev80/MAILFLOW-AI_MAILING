"use client";

import { type DailySummary, type DailySummaryItem } from "@/lib/attention-api";
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
    <main className="container" style={{ maxWidth: 1440, margin: "0 auto" }}>
      <SummaryHeader />
      {props.error && <ErrorBanner error={props.error} onReload={props.onReload} />}
      {!props.summary && !props.error && <div className="card muted">{t("common.loading")}</div>}
      {props.summary && <SummaryContent summary={props.summary} isEmpty={props.isEmpty} />}
    </main>
  );
}

function SummaryHeader() {
  const { t } = useI18n();
  return (
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>{t("nav.dailySummary")}</h1>
        <p className="muted" style={{ marginBottom: 0 }}>{t("summary.description")}</p>
      </div>
      <nav style={{ display: "flex", gap: 8 }}>
        <Link className="btn secondary" href="/app/review">{t("nav.review")}</Link>
        <Link className="btn secondary" href="/app/notifications">{t("nav.notifications")}</Link>
      </nav>
    </header>
  );
}

function ErrorBanner({ error, onReload }: { error: string; onReload: () => Promise<void> }) {
  const { t } = useI18n();
  return (
    <div className="alert error" role="alert" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
      <span>{error}</span>
      <button className="btn secondary" type="button" onClick={() => void onReload()}>{t("review.retry")}</button>
    </div>
  );
}

function SummaryContent({ summary, isEmpty }: { summary: DailySummary; isEmpty: boolean }) {
  const { t, locale } = useI18n();
  return (
    <>
      <CounterGrid summary={summary} />
      <div className="muted" style={{ marginBottom: 20 }}>
        {t("summary.since")} {new Date(summary.since).toLocaleString(locale)} · {t("summary.generated")} {new Date(summary.generated_at).toLocaleString(locale)}
      </div>
      {isEmpty ? <div className="empty">{t("summary.empty")}</div> : <SummarySections summary={summary} />}
    </>
  );
}

function CounterGrid({ summary }: { summary: DailySummary }) {
  const { t } = useI18n();
  const values = [
    [t("summary.urgent"), summary.counters.urgent],
    [t("summary.action"), summary.counters.action_required],
    [t("nav.review"), summary.counters.review_needed],
    [t("summary.security"), summary.counters.security],
    [t("review.failures"), summary.counters.failures],
  ] as const;
  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
      {values.map(([label, value]) => <Counter key={label} label={label} value={value} />)}
    </section>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <strong style={{ display: "block", fontSize: 24 }}>{value}</strong>
      <span className="muted">{label}</span>
    </div>
  );
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
    <div style={{ display: "grid", gap: 16 }}>
      {groups.map(([title, items]) => items.length > 0 && <SummarySection key={title} title={title} items={items} />)}
    </div>
  );
}

function SummarySection({ title, items }: { title: string; items: DailySummaryItem[] }) {
  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <div style={{ display: "grid", gap: 0 }}>
        {items.map((item, index) => <SummaryItemRow key={`${item.account_id}-${item.message_id}`} item={item} bordered={index > 0} />)}
      </div>
    </section>
  );
}

function SummaryItemRow({ item, bordered }: { item: DailySummaryItem; bordered: boolean }) {
  const { t } = useI18n();
  return (
    <article style={{ borderTop: bordered ? "1px solid var(--mf-border)" : undefined, padding: "12px 0" }}>
      <strong>{item.subject || t("review.noSubject")}</strong>
      <div className="muted">{item.from_email} · {item.account_label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        <span className="pill">{enumLabel(t, "category", item.category)}</span>
        <span className="pill">{enumLabel(t, "importance", item.importance)}</span>
        <span className="pill">{enumLabel(t, "urgency", item.urgency)}</span>
        {item.action_required === "yes" && <span className="pill">{t("review.actionRequired")}</span>}
      </div>
      {item.reason && <p style={{ marginBottom: 0 }}>{item.reason}</p>}
    </article>
  );
}
