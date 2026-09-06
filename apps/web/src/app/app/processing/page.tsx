"use client";

import { api } from "@/lib/api";
import { backfillApi, type BackfillJob } from "@/lib/backfill-api";
import type { EmailAccount } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import page from "@/components/figma-page.module.css";

type JobWithMailbox = BackfillJob & { mailbox: string };
type Filter = "all" | "active" | "completed" | "failed";

export default function ProcessingPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [jobs, setJobs] = useState<JobWithMailbox[]>([]);
  const [processedToday, setProcessedToday] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const accountList = await api.listAccounts();
      setAccounts(accountList);
      const [backfills, cycles] = await Promise.all([
        Promise.all(accountList.map(async (account) => (await backfillApi.list(account.id)).map((job) => ({ ...job, mailbox: account.username })))),
        Promise.all(accountList.map((account) => api.listCycles(account.id))),
      ]);
      setJobs(backfills.flat().sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)));
      const today = new Date();
      setProcessedToday(cycles.flat().filter((cycle) => sameLocalDay(new Date(cycle.created_at), today)).reduce((sum, cycle) => sum + cycle.emails_processed, 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load processing jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const active = jobs.filter((job) => job.state === "running").length;
  const delayed = jobs.filter((job) => job.state === "paused").length;
  const failures = jobs.filter((job) => job.state === "failed").length;
  const filtered = useMemo(() => jobs.filter((job) => {
    if (filter === "active") return job.state === "running" || job.state === "paused";
    if (filter === "completed") return job.state === "completed";
    if (filter === "failed") return job.state === "failed" || job.state === "cancelled";
    return true;
  }), [filter, jobs]);

  async function pauseAll() {
    const running = jobs.filter((job) => job.state === "running");
    if (running.length === 0) return;
    setBusy(true); setError(null);
    try { await Promise.all(running.map((job) => backfillApi.pause(job.account_id, job.id))); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to pause jobs"); }
    finally { setBusy(false); }
  }

  async function restartFailed() {
    const failed = jobs.filter((job) => job.state === "failed" || job.state === "paused");
    if (failed.length === 0) return;
    setBusy(true); setError(null);
    try {
      const results = await Promise.allSettled(failed.map((job) => backfillApi.resume(job.account_id, job.id)));
      const rejected = results.filter((result) => result.status === "rejected");
      if (rejected.length) setError(`${rejected.length} job(s) could not be resumed.`);
      await load();
    } finally { setBusy(false); }
  }

  return (
    <main className={page.page}>
      <div className={page.titleBlock}><h1 className={page.title}>Processing & Jobs</h1><p className={page.subtitle}>Monitor real-time mailbox processing, historical backfill and classification work</p></div>
      <div className={page.kpis4}>
        <Kpi label="Active Pipelines" value={`${active} Active`} tone="info" />
        <Kpi label="Total Processed Today" value={processedToday.toLocaleString()} tone="success" />
        <Kpi label="Deferred or Delayed" value={`${delayed} Waiting`} tone="warning" />
        <Kpi label="Job Failures" value={`${failures} Critical`} tone="danger" />
      </div>
      <div className={page.chips}>
        <FilterChip value="all" label="All Jobs" current={filter} onChange={setFilter} />
        <FilterChip value="active" label="Active Tasks" current={filter} onChange={setFilter} />
        <FilterChip value="completed" label="Completed" current={filter} onChange={setFilter} />
        <FilterChip value="failed" label="Failed & Interrupted" current={filter} onChange={setFilter} />
      </div>
      {error && <div className={page.error}>{error}</div>}
      <section className={page.panel}>
        {loading ? <div className={page.empty}>Loading processing jobs…</div> : (
          <>
            <div className={page.tableWrap}>
              <table className={page.table}>
                <thead><tr><th>Job</th><th>Mailbox</th><th>Progress & Backfill</th><th>Status</th><th>Started</th><th>Remaining</th></tr></thead>
                <tbody>
                  {filtered.map((job) => <JobRow key={job.id} job={job} />)}
                </tbody>
              </table>
              {filtered.length === 0 && <div className={page.empty}>No jobs match this filter.</div>}
            </div>
            <div className={page.footer}>
              <span>Showing {filtered.length} of {jobs.length} backfill jobs across {accounts.length} mailboxes</span>
              <div className={page.actions}>
                <button className="btn secondary" type="button" disabled={busy || active === 0} onClick={() => void pauseAll()}>Pause All</button>
                <button className="btn" type="button" disabled={busy || (failures === 0 && delayed === 0)} onClick={() => void restartFailed()}>Restart Failed</button>
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
function JobRow({ job }: { job: JobWithMailbox }) {
  const percent = job.total_discovered > 0 ? Math.min(100, Math.round((job.processed / job.total_discovered) * 100)) : job.state === "completed" ? 100 : 0;
  const tone = job.state === "completed" ? page.success : job.state === "failed" ? page.danger : job.state === "paused" ? page.warning : job.state === "running" ? page.info : page.neutral;
  return (
    <tr>
      <td><strong>Historical Mail Analysis</strong><div style={{ marginTop: 3, color: "var(--mf-text-muted)", fontSize: 11 }}>{job.mode === "dry_run" ? "Safe Dry Run" : job.mode}</div></td>
      <td>{job.mailbox}</td>
      <td><div style={{ display: "grid", gap: 6, minWidth: 150 }}><strong>{percent}%</strong><div className={page.progressTrack}><div className={page.progressBar} style={{ width: `${percent}%`, background: job.state === "failed" ? "var(--mf-danger)" : undefined }} /></div></div></td>
      <td><span className={`${page.badge} ${tone}`}>{statusLabel(job.state)}</span></td>
      <td>{formatTime(job.created_at)}</td>
      <td>{job.remaining.toLocaleString()}</td>
    </tr>
  );
}
function statusLabel(state: string): string { return state === "running" ? "Active" : state === "paused" ? "Deferred" : state[0]?.toUpperCase() + state.slice(1); }
function formatTime(value: string): string { return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function sameLocalDay(a: Date, b: Date): boolean { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
