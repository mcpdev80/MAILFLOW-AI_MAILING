"use client";

import page from "@/components/figma-page.module.css";
import { api } from "@/lib/api";
import { type BackfillJob, backfillApi } from "@/lib/backfill-api";
import { type TranslationKey, useI18n } from "@/lib/i18n";
import type { EmailAccount } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type JobWithMailbox = BackfillJob & {
  mailbox: string;
  ratePerMinute: number | null;
};
type Filter = "all" | "active" | "completed" | "failed";

type RateSample = {
  processed: number;
  at: number;
  ratePerMinute: number | null;
};

export default function ProcessingPage() {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [jobs, setJobs] = useState<JobWithMailbox[]>([]);
  const [processedToday, setProcessedToday] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rateSamples = useRef<Map<string, RateSample>>(new Map());

  const active = jobs.filter((job) => job.state === "running").length;
  const delayed = jobs.filter((job) => job.state === "paused").length;
  const failures = jobs.filter((job) => job.state === "failed").length;

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const accountList = await api.listAccounts();
        setAccounts(accountList);
        const [backfills, cycles] = await Promise.all([
          Promise.all(
            accountList.map(async (account) =>
              (await backfillApi.list(account.id)).map((job) => ({
                ...job,
                mailbox: account.username,
              })),
            ),
          ),
          Promise.all(accountList.map((account) => api.listCycles(account.id))),
        ]);

        const sampledAt = Date.now();
        const flatBackfills: JobWithMailbox[] = backfills
          .flat()
          .map((job) => {
            const previous = rateSamples.current.get(job.id);
            let ratePerMinute = previous?.ratePerMinute ?? null;
            if (
              previous &&
              job.processed > previous.processed &&
              sampledAt > previous.at
            ) {
              ratePerMinute =
                (job.processed - previous.processed) /
                ((sampledAt - previous.at) / 60_000);
            }
            rateSamples.current.set(job.id, {
              processed: job.processed,
              at: sampledAt,
              ratePerMinute,
            });
            return { ...job, ratePerMinute };
          })
          .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));

        setJobs(flatBackfills);
        const today = new Date();
        const cycleProcessedToday = cycles
          .flat()
          .filter((cycle) => sameLocalDay(new Date(cycle.created_at), today))
          .reduce((sum, cycle) => sum + cycle.emails_processed, 0);
        const backfillProcessedToday = flatBackfills
          .filter((job) => sameLocalDay(new Date(job.updated_at), today))
          .reduce((sum, job) => sum + job.processed, 0);
        setProcessedToday(cycleProcessedToday + backfillProcessedToday);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("processing.unableLoad"));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (active === 0) return;
    const timer = window.setInterval(() => {
      void load(true);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [active, load]);

  const filtered = useMemo(
    () =>
      jobs.filter((job) => {
        if (filter === "active")
          return job.state === "running" || job.state === "paused";
        if (filter === "completed") return job.state === "completed";
        if (filter === "failed")
          return job.state === "failed" || job.state === "cancelled";
        return true;
      }),
    [filter, jobs],
  );

  async function pauseAll() {
    const running = jobs.filter((job) => job.state === "running");
    if (running.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await Promise.all(
        running.map((job) => backfillApi.pause(job.account_id, job.id)),
      );
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("processing.unablePause"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function restartFailed() {
    const failed = jobs.filter(
      (job) => job.state === "failed" || job.state === "paused",
    );
    if (failed.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        failed.map((job) => backfillApi.resume(job.account_id, job.id)),
      );
      const rejected = results.filter((result) => result.status === "rejected");
      if (rejected.length)
        setError(`${rejected.length} ${t("processing.resumeFailedSuffix")}`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={page.page}>
      <div className={page.titleBlock}>
        <h1 className={page.title}>{t("processing.title")}</h1>
        <p className={page.subtitle}>{t("processing.subtitle")}</p>
      </div>
      <div className={page.kpis4}>
        <Kpi label={t("processing.activePipelines")} value={`${active} ${t("processing.active")}`} tone="info" />
        <Kpi label={t("processing.totalProcessedToday")} value={processedToday.toLocaleString()} tone="success" />
        <Kpi label={t("processing.deferredDelayed")} value={`${delayed} ${t("processing.waiting")}`} tone="warning" />
        <Kpi label={t("processing.jobFailures")} value={`${failures} ${t("processing.critical")}`} tone="danger" />
      </div>
      <div className={page.chips}>
        <FilterChip value="all" label={t("processing.allJobs")} current={filter} onChange={setFilter} />
        <FilterChip value="active" label={t("processing.activeTasks")} current={filter} onChange={setFilter} />
        <FilterChip value="completed" label={t("processing.completed")} current={filter} onChange={setFilter} />
        <FilterChip value="failed" label={t("processing.failedInterrupted")} current={filter} onChange={setFilter} />
      </div>
      {error && <div className={page.error}>{error}</div>}
      <section className={page.panel}>
        {loading ? (
          <div className={page.empty}>{t("processing.loading")}</div>
        ) : (
          <>
            <div className={page.tableWrap}>
              <table className={page.table}>
                <thead>
                  <tr>
                    <th>{t("processing.job")}</th>
                    <th>{t("processing.mailbox")}</th>
                    <th>{t("processing.progressBackfill")}</th>
                    <th>{t("processing.status")}</th>
                    <th>{t("processing.started")}</th>
                    <th>{t("processing.remaining")}</th>
                    <th style={{ textAlign: "right" }}>{t("processing.action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((job) => <JobRow key={job.id} job={job} t={t} />)}
                </tbody>
              </table>
              {filtered.length === 0 && <div className={page.empty}>{t("processing.noJobs")}</div>}
            </div>
            <div className={page.footer}>
              <span>{t("processing.showing")} {filtered.length} {t("processing.of")} {jobs.length} {t("processing.jobsAcross")} {accounts.length} {t("processing.mailboxes")}</span>
              <div className={page.actions}>
                <button className="btn secondary" type="button" disabled={busy || active === 0} onClick={() => void pauseAll()}>{t("processing.pauseAll")}</button>
                <button className="btn" type="button" disabled={busy || (failures === 0 && delayed === 0)} onClick={() => void restartFailed()}>{t("processing.restartFailed")}</button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: "info" | "success" | "warning" | "danger" }) {
  const color = tone === "success" ? "var(--mf-success)" : tone === "warning" ? "var(--mf-warning)" : tone === "danger" ? "var(--mf-danger)" : "var(--mf-primary)";
  return <div className={page.kpi}><div className={page.kpiLabel}><span>{label}</span><span className={page.kpiDot} style={{ background: color }} /></div><span className={page.kpiValue}>{value}</span></div>;
}

function FilterChip({ value, label, current, onChange }: { value: Filter; label: string; current: Filter; onChange: (value: Filter) => void }) {
  return <button type="button" className={`${page.chip} ${current === value ? page.chipActive : ""}`} onClick={() => onChange(value)}>{label}</button>;
}

function JobRow({ job, t }: { job: JobWithMailbox; t: (key: TranslationKey) => string }) {
  const percent = job.total_discovered > 0 ? Math.min(100, Math.round((job.processed / job.total_discovered) * 100)) : job.state === "completed" ? 100 : 0;
  const tone = job.state === "completed" ? page.success : job.state === "failed" ? page.danger : job.state === "paused" ? page.warning : job.state === "running" ? page.info : page.neutral;
  const etaMinutes = job.ratePerMinute && job.ratePerMinute > 0 ? job.remaining / job.ratePerMinute : null;
  const canReview = (job.mode === "dry_run" || job.mode === "review") && job.processed > 0;
  const needsReview = canReview && job.review_required > 0;

  return (
    <tr>
      <td>
        <strong>{t("processing.historicalAnalysis")}</strong>
        <div style={{ marginTop: 3, color: "var(--mf-text-muted)", fontSize: 11 }}>{job.mode === "dry_run" ? t("processing.safeDryRun") : job.mode}</div>
      </td>
      <td>{job.mailbox}</td>
      <td>
        <div style={{ display: "grid", gap: 6, minWidth: 220 }}>
          <strong>{percent}% · {job.processed.toLocaleString()} / {job.total_discovered.toLocaleString()}</strong>
          <div className={page.progressTrack}><div className={page.progressBar} style={{ width: `${percent}%`, background: job.state === "failed" ? "var(--mf-danger)" : undefined }} /></div>
          <div style={{ color: "var(--mf-text-muted)", fontSize: 11 }}>{t("processing.successful")}: {job.successful.toLocaleString()} · {t("processing.reviewRequired")}: {job.review_required.toLocaleString()} · {t("processing.failed")}: {job.failed.toLocaleString()}</div>
          {job.ratePerMinute !== null && job.ratePerMinute > 0 && <div style={{ color: "var(--mf-text-muted)", fontSize: 11 }}>{t("processing.rate")}: {job.ratePerMinute.toFixed(1)}/min{etaMinutes !== null && <> · {t("processing.eta")}: {formatDurationMinutes(etaMinutes)}</>}</div>}
          {job.last_error && <div style={{ color: "var(--mf-danger)", fontSize: 11 }}>{job.last_error}</div>}
        </div>
      </td>
      <td><span className={`${page.badge} ${tone}`}>{statusLabel(job.state, t)}</span></td>
      <td>{formatTime(job.created_at)}</td>
      <td>{job.remaining.toLocaleString()}</td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {canReview ? (
          <Link
            className={needsReview ? "btn" : "btn secondary"}
            style={needsReview ? {
              display: "inline-flex",
              minHeight: 34,
              padding: "7px 14px",
              fontWeight: 700,
              background: "var(--mf-primary)",
              borderColor: "var(--mf-primary)",
              color: "var(--mf-primary-contrast)",
              boxShadow: "0 0 0 1px color-mix(in srgb, var(--mf-primary) 35%, transparent), 0 4px 14px color-mix(in srgb, var(--mf-primary) 25%, transparent)",
            } : { display: "inline-flex", minHeight: 32, padding: "6px 12px" }}
            href={`/app/processing/review?account=${encodeURIComponent(job.account_id)}&job=${encodeURIComponent(job.id)}`}
          >
            {needsReview ? t("processing.reviewNow") : t("processing.viewReview")}
          </Link>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
    </tr>
  );
}

function statusLabel(state: string, t: (key: TranslationKey) => string): string {
  if (state === "running") return t("processing.active");
  if (state === "paused") return t("processing.deferred");
  if (state === "completed") return t("processing.completed");
  if (state === "failed") return t("processing.failed");
  if (state === "cancelled") return t("processing.cancelled");
  return state;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDurationMinutes(value: string | number): string {
  const minutes = Math.max(0, Math.round(Number(value)));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
