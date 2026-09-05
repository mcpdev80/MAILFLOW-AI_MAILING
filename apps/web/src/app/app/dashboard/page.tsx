"use client";

import { ApiError, api } from "@/lib/api";
import {
  dashboardApi,
  type DashboardBreakdownItem,
  type DashboardOverview,
} from "@/lib/dashboard-api";
import { enumLabel, useI18n } from "@/lib/i18n";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

function MetricCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const content = (
    <div className="card" style={{ padding: "0.9rem 1rem", minWidth: 150 }}>
      <strong style={{ fontSize: "1.55rem" }}>{value.toLocaleString()}</strong>
      <div className="muted">{label}</div>
    </div>
  );
  return href ? (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      {content}
    </Link>
  ) : (
    content
  );
}

function Distribution({
  title,
  items,
  hrefFor,
}: {
  title: string;
  items: DashboardBreakdownItem[];
  hrefFor?: (key: string) => string;
}) {
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <section className="card">
      <h3>{title}</h3>
      <div style={{ display: "grid", gap: "0.55rem" }}>
        {items.map((item) => {
          const row = (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(110px, 1fr) 3fr auto",
                gap: "0.65rem",
                alignItems: "center",
              }}
            >
              <span>{item.key}</span>
              <div
                style={{
                  height: 8,
                  background: "var(--border, #ddd)",
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.max((item.count / max) * 100, 2)}%`,
                    background: "currentColor",
                    opacity: 0.55,
                  }}
                />
              </div>
              <strong>{item.count.toLocaleString()}</strong>
            </div>
          );
          return hrefFor ? (
            <Link
              key={item.key}
              href={hrefFor(item.key)}
              style={{ color: "inherit", textDecoration: "none" }}
            >
              {row}
            </Link>
          ) : (
            <div key={item.key}>{row}</div>
          );
        })}
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [rangeDays, setRangeDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const { t } = useI18n();

  const load = useCallback(async (days = rangeDays) => {
    setError(null);
    try {
      setOverview(await dashboardApi.overview(days));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Could not reach the API (${err.message})`
          : err instanceof Error
            ? err.message
            : "Could not reach the API",
      );
      setOverview(null);
    }
  }, [rangeDays]);

  useEffect(() => {
    load(rangeDays);
  }, [load, rangeDays]);

  async function runNow(id: string) {
    setRunningId(id);
    setNotice(null);
    setError(null);
    try {
      const response = await api.runCycle(id);
      setNotice(
        response.enqueued
          ? "Cycle enqueued."
          : "Could not enqueue the processing cycle.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunningId(null);
    }
  }

  const categoryItems = useMemo(
    () =>
      (overview?.categories ?? []).map((item) => ({
        ...item,
        key: enumLabel(t, "category", item.key),
        rawKey: item.key,
      })),
    [overview?.categories, t],
  );

  const handlingItems = useMemo(
    () => overview?.handling ?? [],
    [overview?.handling],
  );

  return (
    <main className="container">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1>{t("nav.dashboard")}</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Operational health and mail outcomes across your authorized mailboxes.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link className="btn" href="/app/search">
            Search mail
          </Link>
          <Link className="btn secondary" href="/app/compose">
            {t("dashboard.compose")}
          </Link>
          <Link className="btn secondary" href="/onboarding">
            {t("dashboard.connectMailbox")}
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.45rem", marginBottom: "1rem" }}>
        {[1, 7, 30].map((days) => (
          <button
            type="button"
            key={days}
            className={rangeDays === days ? "btn" : "btn secondary"}
            onClick={() => setRangeDays(days)}
          >
            {days === 1 ? "Today" : `${days} days`}
          </button>
        ))}
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}
      {!overview && !error && <p className="muted">{t("common.loading")}</p>}

      {overview && (
        <>
          {overview.inference_warning && (
            <div className="alert error">{overview.inference_warning}</div>
          )}

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "0.65rem",
              marginBottom: "1rem",
            }}
          >
            <MetricCard label="Processed today" value={overview.counters.processed_today} />
            <MetricCard
              label={`Processed (${rangeDays}d)`}
              value={overview.counters.processed_range}
            />
            <MetricCard
              label={t("review.title")}
              value={overview.counters.review_required}
              href="/app/search?review_required=true"
            />
            <MetricCard
              label={t("review.actionRequired")}
              value={overview.counters.action_required}
              href="/app/search?action_required=yes"
            />
            <MetricCard
              label={t("review.urgent")}
              value={overview.counters.urgent}
              href="/app/search?urgency=today"
            />
            <MetricCard
              label={t("review.failures")}
              value={overview.counters.failed_or_deferred}
              href="/app/search?processed_state=failed"
            />
            <MetricCard
              label="Pending / queued"
              value={overview.counters.pending_or_queued}
            />
            <MetricCard
              label="Active backfills"
              value={overview.counters.active_backfills}
            />
          </section>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <Distribution
              title="Classification"
              items={handlingItems}
              hrefFor={(key) => `/app/search?classification_source=${key}`}
            />
            <Distribution
              title={t("review.category")}
              items={categoryItems}
              hrefFor={(displayKey) => {
                const item = categoryItems.find((entry) => entry.key === displayKey);
                return `/app/search?category=${encodeURIComponent(item?.rawKey ?? displayKey)}`;
              }}
            />
          </div>

          <section className="card" style={{ marginBottom: "1rem" }}>
            <h3>Processing trend</h3>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Processed</th>
                    <th>{t("review.title")}</th>
                    <th>{t("review.failures")}</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.trend.map((point) => (
                    <tr key={point.day}>
                      <td>{point.day}</td>
                      <td>{point.processed}</td>
                      <td>{point.review}</td>
                      <td>{point.failures}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h3>{t("dashboard.mailbox")}</h3>
            {overview.mailboxes.length === 0 ? (
              <div className="empty">
                <p>{t("dashboard.noMailboxes")}</p>
                <Link className="btn" href="/onboarding">
                  {t("dashboard.connectFirst")}
                </Link>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("dashboard.mailbox")}</th>
                      <th>{t("dashboard.status")}</th>
                      <th>Today</th>
                      <th>{t("review.title")}</th>
                      <th>Backfill</th>
                      <th>{t("dashboard.lastCycle")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {overview.mailboxes.map((mailbox) => (
                      <tr key={mailbox.account_id}>
                        <td>
                          <Link href={`/app/accounts/${mailbox.account_id}`}>
                            {mailbox.label}
                          </Link>
                          <div className="muted">{mailbox.ownership_mode}</div>
                        </td>
                        <td>
                          <span
                            className={`pill ${mailbox.health === "healthy" ? "ok" : "off"}`}
                          >
                            {mailbox.health}
                          </span>
                          {mailbox.last_error && (
                            <div className="muted">{mailbox.last_error}</div>
                          )}
                        </td>
                        <td>
                          <Link
                            href={`/app/search?account_id=${mailbox.account_id}`}
                          >
                            {mailbox.processed_today}
                          </Link>
                        </td>
                        <td>{mailbox.review_count}</td>
                        <td>
                          {mailbox.backfill_status ? (
                            <span>
                              {mailbox.backfill_status} {mailbox.backfill_processed ?? 0}/
                              {mailbox.backfill_total ?? 0}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="muted">
                          {mailbox.last_cycle_at
                            ? new Date(mailbox.last_cycle_at).toLocaleString()
                            : t("dashboard.never")}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn secondary"
                            disabled={runningId === mailbox.account_id}
                            onClick={() => runNow(mailbox.account_id)}
                          >
                            {runningId === mailbox.account_id
                              ? t("dashboard.running")
                              : t("dashboard.runNow")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
