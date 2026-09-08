"use client";

import { ApiError } from "@/lib/api";
import { backfillApi, type BackfillJob } from "@/lib/backfill-api";
import {
  bulkReviewApi,
  type BulkReviewCluster,
  type BulkReviewSummary,
} from "@/lib/bulk-review-api";
import { enumLabel, useI18n } from "@/lib/i18n";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./review.module.css";

type Filter = "review" | "safe" | "all";

type Copy = {
  title: string;
  subtitle: string;
  back: string;
  analyzed: string;
  safe: string;
  review: string;
  decisions: string;
  suspicious: string;
  autoReady: string;
  humanDecisions: string;
  requiresReview: string;
  blockedSecurity: string;
  approveSafe: string;
  approving: string;
  applyApproved: string;
  applying: string;
  runningHint: string;
  approvedHint: string;
  clusters: string;
  all: string;
  target: string;
  keep: string;
  move: string;
  confidence: string;
  approveGroup: string;
  approveDomain: string;
  senders: string;
  examples: string;
  noClusters: string;
  loading: string;
  missingParams: string;
  refreshed: string;
  approvedCount: string;
  applyStarted: string;
  applyExisting: string;
};

const COPY: Record<"de" | "en" | "es", Copy> = {
  de: {
    title: "Historische Entscheidungen prüfen",
    subtitle: "Mailflow fasst ähnliche Mails zu wenigen Entscheidungen zusammen. Du prüfst Gruppen statt einzelne Nachrichten.",
    back: "Zur Verarbeitung",
    analyzed: "Analysiert",
    safe: "Sicher",
    review: "Prüfung nötig",
    decisions: "Entscheidungsgruppen",
    suspicious: "Sicherheitsfälle",
    autoReady: "können gesammelt freigegeben werden",
    humanDecisions: "statt jede Mail einzeln zu prüfen",
    requiresReview: "brauchen eine Entscheidung",
    blockedSecurity: "werden nie gesammelt freigegeben",
    approveSafe: "Sichere Ergebnisse freigeben",
    approving: "Freigabe läuft …",
    applyApproved: "Freigegebene anwenden",
    applying: "Anwendung startet …",
    runningHint: "Der Testlauf läuft noch. Du kannst die Gruppen bereits ansehen; angewendet wird erst nach Abschluss.",
    approvedHint: "Freigegeben",
    clusters: "Prüfung nötig",
    all: "Alle Gruppen",
    target: "Ziel",
    keep: "Im aktuellen Ordner lassen",
    move: "Verschieben",
    confidence: "Ø Sicherheit",
    approveGroup: "Gruppe bestätigen",
    approveDomain: "Teilgruppe bestätigen",
    senders: "Absender-Gruppen",
    examples: "Beispiele",
    noClusters: "Für diesen Filter gibt es keine Gruppen.",
    loading: "Entscheidungen werden zusammengefasst …",
    missingParams: "Postfach oder Job fehlt.",
    refreshed: "Ansicht aktualisiert.",
    approvedCount: "Ergebnisse freigegeben",
    applyStarted: "Anwendung wurde gestartet.",
    applyExisting: "Für diesen Testlauf existiert bereits ein Apply-Lauf.",
  },
  en: {
    title: "Review historical decisions",
    subtitle: "Mailflow compresses similar messages into a small set of decisions, so you review groups instead of individual emails.",
    back: "Back to processing",
    analyzed: "Analyzed",
    safe: "Safe",
    review: "Needs review",
    decisions: "Decision groups",
    suspicious: "Security cases",
    autoReady: "can be approved together",
    humanDecisions: "instead of reviewing every message",
    requiresReview: "need a decision",
    blockedSecurity: "are never bulk-approved",
    approveSafe: "Approve safe results",
    approving: "Approving …",
    applyApproved: "Apply approved results",
    applying: "Starting apply …",
    runningHint: "The dry run is still running. You can already inspect groups; apply becomes available after completion.",
    approvedHint: "Approved",
    clusters: "Needs review",
    all: "All groups",
    target: "Target",
    keep: "Keep in current folder",
    move: "Move",
    confidence: "Avg. confidence",
    approveGroup: "Confirm group",
    approveDomain: "Confirm subgroup",
    senders: "Sender groups",
    examples: "Examples",
    noClusters: "No groups match this filter.",
    loading: "Compressing decisions …",
    missingParams: "Mailbox or job is missing.",
    refreshed: "View refreshed.",
    approvedCount: "results approved",
    applyStarted: "Apply job started.",
    applyExisting: "An apply job already exists for this dry run.",
  },
  es: {
    title: "Revisar decisiones históricas",
    subtitle: "Mailflow agrupa correos similares en pocas decisiones para revisar grupos en vez de mensajes individuales.",
    back: "Volver al procesamiento",
    analyzed: "Analizados",
    safe: "Seguros",
    review: "Requieren revisión",
    decisions: "Grupos de decisión",
    suspicious: "Casos de seguridad",
    autoReady: "se pueden aprobar juntos",
    humanDecisions: "en lugar de revisar cada correo",
    requiresReview: "necesitan una decisión",
    blockedSecurity: "nunca se aprueban en bloque",
    approveSafe: "Aprobar resultados seguros",
    approving: "Aprobando …",
    applyApproved: "Aplicar aprobados",
    applying: "Iniciando aplicación …",
    runningHint: "La prueba segura sigue en curso. Ya puedes revisar los grupos; la aplicación se habilita al terminar.",
    approvedHint: "Aprobados",
    clusters: "Requieren revisión",
    all: "Todos los grupos",
    target: "Destino",
    keep: "Mantener en la carpeta actual",
    move: "Mover",
    confidence: "Confianza media",
    approveGroup: "Confirmar grupo",
    approveDomain: "Confirmar subgrupo",
    senders: "Grupos de remitentes",
    examples: "Ejemplos",
    noClusters: "No hay grupos para este filtro.",
    loading: "Agrupando decisiones …",
    missingParams: "Falta el buzón o el trabajo.",
    refreshed: "Vista actualizada.",
    approvedCount: "resultados aprobados",
    applyStarted: "La aplicación se ha iniciado.",
    applyExisting: "Ya existe una aplicación para esta prueba.",
  },
};

export default function BulkReviewPage() {
  const params = useSearchParams();
  const accountId = params.get("account") ?? "";
  const jobId = params.get("job") ?? "";
  const { locale, t } = useI18n();
  const copy = COPY[locale];
  const [summary, setSummary] = useState<BulkReviewSummary | null>(null);
  const [job, setJob] = useState<BackfillJob | null>(null);
  const [filter, setFilter] = useState<Filter>("review");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountId || !jobId) return;
    setError(null);
    const [summaryResult, jobsResult] = await Promise.all([
      bulkReviewApi.summary(accountId, jobId),
      backfillApi.list(accountId),
    ]);
    setSummary(summaryResult);
    setJob(jobsResult.find((item) => item.id === jobId) ?? null);
  }, [accountId, jobId]);

  useEffect(() => {
    void load().catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [load]);

  useEffect(() => {
    if (job?.state !== "running") return;
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [job?.state, load]);

  const clusters = useMemo(() => {
    const rows = summary?.clusters ?? [];
    if (filter === "review")
      return rows.filter((item) => item.review_required > 0 || item.suspicious > 0);
    if (filter === "safe")
      return rows.filter((item) => item.review_required === 0 && item.suspicious === 0);
    return rows;
  }, [filter, summary]);

  async function approveSafe() {
    if (!accountId || !jobId) return;
    setBusy("safe");
    setNotice(null);
    setError(null);
    try {
      const result = await bulkReviewApi.approveSafe(accountId, jobId);
      setNotice(`${result.approved.toLocaleString()} ${copy.approvedCount}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function approveCluster(clusterId: string) {
    if (!accountId || !jobId) return;
    setBusy(clusterId);
    setNotice(null);
    setError(null);
    try {
      const result = await bulkReviewApi.approveCluster(accountId, jobId, clusterId);
      const blocked = result.blocked_suspicious
        ? ` · ${result.blocked_suspicious.toLocaleString()} ${copy.suspicious.toLowerCase()}`
        : "";
      setNotice(`${result.approved.toLocaleString()} ${copy.approvedCount}${blocked}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function startApply() {
    if (!accountId || !jobId) return;
    setBusy("apply");
    setNotice(null);
    setError(null);
    try {
      const result = await bulkReviewApi.startApply(accountId, jobId, 50);
      setNotice(result.enqueued ? copy.applyStarted : result.job.last_error ?? copy.applyExisting);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.message === "no_approved_proposals") {
        setError("no_approved_proposals");
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(null);
    }
  }

  if (!accountId || !jobId) {
    return <main className={styles.page}><div className={styles.error}>{copy.missingParams}</div></main>;
  }

  const approved = summary?.status_counts.approved ?? 0;
  const canApply = job?.state === "completed" && approved > 0;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <Link href="/app/processing">← {copy.back}</Link>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
        <div className={styles.headerActions}>
          <button className="btn secondary" type="button" disabled={busy !== null || !summary?.safe} onClick={() => void approveSafe()}>
            {busy === "safe" ? copy.approving : copy.approveSafe}
          </button>
          <button className="btn" type="button" disabled={busy !== null || !canApply} onClick={() => void startApply()}>
            {busy === "apply" ? copy.applying : copy.applyApproved}
          </button>
        </div>
      </header>

      {job?.state === "running" && <div className={styles.notice}>{copy.runningHint}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}
      {error && <div className={styles.error}>{error}</div>}

      {!summary ? (
        <div className={styles.empty}>{copy.loading}</div>
      ) : (
        <>
          <section className={styles.summary}>
            <Stat label={copy.analyzed} value={summary.total} hint={job ? `${job.processed.toLocaleString()} / ${job.total_discovered.toLocaleString()}` : ""} />
            <Stat label={copy.safe} value={summary.safe} hint={copy.autoReady} />
            <Stat label={copy.review} value={summary.review_required} hint={copy.requiresReview} />
            <Stat label={copy.decisions} value={summary.decision_count} hint={copy.humanDecisions} />
          </section>

          <div className={styles.toolbar}>
            <div className={styles.tabs}>
              <FilterButton value="review" current={filter} label={`${copy.clusters} (${summary.review_required + summary.suspicious})`} onChange={setFilter} />
              <FilterButton value="safe" current={filter} label={`${copy.safe} (${summary.safe})`} onChange={setFilter} />
              <FilterButton value="all" current={filter} label={`${copy.all} (${summary.decision_count})`} onChange={setFilter} />
            </div>
            <span className={styles.statusText}>{copy.approvedHint}: {approved.toLocaleString()}</span>
          </div>

          <section className={styles.clusterList}>
            {clusters.map((cluster) => (
              <ClusterCard
                key={cluster.id}
                cluster={cluster}
                busy={busy}
                copy={copy}
                categoryLabel={enumLabel(t, "category", cluster.category)}
                onApprove={approveCluster}
              />
            ))}
            {clusters.length === 0 && <div className={styles.empty}>{copy.noClusters}</div>}
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return <div className={styles.stat}><span className={styles.statLabel}>{label}</span><span className={styles.statValue}>{value.toLocaleString()}</span><span className={styles.statHint}>{hint}</span></div>;
}

function FilterButton({ value, current, label, onChange }: { value: Filter; current: Filter; label: string; onChange: (value: Filter) => void }) {
  return <button type="button" className={`${styles.tab} ${current === value ? styles.tabActive : ""}`} onClick={() => onChange(value)}>{label}</button>;
}

function ClusterCard({ cluster, busy, copy, categoryLabel, onApprove }: { cluster: BulkReviewCluster; busy: string | null; copy: Copy; categoryLabel: string; onApprove: (id: string) => Promise<void> }) {
  const proposed = cluster.statuses.proposed ?? 0;
  const canApprove = proposed > 0 && cluster.suspicious < cluster.count;
  return (
    <article className={styles.cluster}>
      <div className={styles.clusterHeader}>
        <div className={styles.clusterMain}>
          <div className={styles.clusterTitle}><strong>{categoryLabel}</strong><span className={styles.count}>{cluster.count.toLocaleString()} Mails</span></div>
          <div className={styles.route}><span>{cluster.action === "move" ? copy.move : copy.keep}</span>{cluster.action === "move" && <><span className={styles.arrow}>→</span><span>{copy.target}: {cluster.destination}</span></>}</div>
          <div className={styles.meta}>
            <span className={styles.pill}>{copy.confidence}: {Math.round(cluster.confidence_avg * 100)}%</span>
            {cluster.safe > 0 && <span className={`${styles.pill} ${styles.pillSuccess}`}>{cluster.safe.toLocaleString()} {copy.safe.toLowerCase()}</span>}
            {cluster.review_required > 0 && <span className={`${styles.pill} ${styles.pillReview}`}>{cluster.review_required.toLocaleString()} {copy.review.toLowerCase()}</span>}
            {cluster.suspicious > 0 && <span className={`${styles.pill} ${styles.pillDanger}`}>{cluster.suspicious.toLocaleString()} {copy.suspicious.toLowerCase()}</span>}
          </div>
        </div>
        <div className={styles.clusterActions}>
          <button className="btn secondary" type="button" disabled={!canApprove || busy !== null} onClick={() => void onApprove(cluster.id)}>{busy === cluster.id ? copy.approving : copy.approveGroup}</button>
        </div>
      </div>
      <details className={styles.details}>
        <summary>{copy.senders} · {cluster.children.length}</summary>
        <div className={styles.children}>
          {cluster.children.map((child) => (
            <div key={child.id}>
              <div className={styles.child}>
                <span className={styles.childDomain}>{child.sender_domain}</span>
                <span className={styles.childMeta}>{child.count.toLocaleString()} · {Math.round(child.confidence_avg * 100)}%</span>
                <button className="btn secondary" type="button" disabled={(child.statuses.proposed ?? 0) === 0 || child.suspicious >= child.count || busy !== null} onClick={() => void onApprove(child.id)}>{busy === child.id ? copy.approving : copy.approveDomain}</button>
              </div>
              {child.samples.length > 0 && (
                <div className={styles.samples}>
                  {child.samples.map((sample) => <div className={styles.sample} key={sample.proposal_id}><span>{sample.from_email}</span><span>{sample.subject}</span><span>{Math.round(sample.confidence * 100)}%</span></div>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </details>
    </article>
  );
}
