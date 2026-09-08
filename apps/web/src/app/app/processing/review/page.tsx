"use client";

import { ApiError, api } from "@/lib/api";
import { backfillApi, type BackfillJob } from "@/lib/backfill-api";
import {
  bulkReviewApi,
  type BulkApplyJob,
  type BulkReviewCluster,
  type BulkReviewSummary,
} from "@/lib/bulk-review-api";
import { enumLabel, useI18n } from "@/lib/i18n";
import type { MailboxFolderView } from "@/lib/types";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { mailFolderLabel } from "../../mail/mail-folder-label";
import styles from "./review.module.css";

type Filter = "review" | "safe" | "all";
type Locale = "de" | "en" | "es";

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
  showSubgroups: string;
  subgroup: string;
  editTarget: string;
  saveTarget: string;
  saving: string;
  unknownSender: string;
  examples: string;
  noClusters: string;
  loading: string;
  missingParams: string;
  approvedCount: string;
  editedCount: string;
  targetSavedPending: string;
  pendingConfirmation: string;
  applyExisting: string;
  applyReadyTitle: string;
  applyReadyBody: string;
  applyMoveCount: string;
  applyKeepCount: string;
  applyNow: string;
  applyRunningTitle: string;
  applyRunningBody: string;
  applyRunningButton: string;
  applyProgress: string;
  applyRemaining: string;
  applyMoved: string;
  applySkipped: string;
  applyFailed: string;
  applyReview: string;
  applyCompletedTitle: string;
  applyCompletedBody: string;
};

const COPY: Record<Locale, Copy> = {
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
    showSubgroups: "Teilgruppen anzeigen und bearbeiten",
    subgroup: "Teilgruppe",
    editTarget: "Ziel ändern",
    saveTarget: "Ziel speichern",
    saving: "Speichern …",
    unknownSender: "Unbekannter Absender",
    examples: "Beispiele",
    noClusters: "Für diesen Filter gibt es keine Gruppen.",
    loading: "Entscheidungen werden zusammengefasst …",
    missingParams: "Postfach oder Job fehlt.",
    approvedCount: "Ergebnisse freigegeben",
    editedCount: "Vorschläge aktualisiert",
    targetSavedPending: "Ziel gespeichert. Die Prüfung bleibt offen, bis du ausdrücklich bestätigst.",
    pendingConfirmation: "Ziel geändert · Bestätigung noch offen",
    applyExisting: "Für diesen Testlauf existiert bereits ein Apply-Lauf.",
    applyReadyTitle: "Freigaben sind bereit – noch wurde nichts im Postfach geändert",
    applyReadyBody: "Bestätigen gibt die Entscheidungen nur frei. Das tatsächliche Verschieben startet erst mit dem Anwenden-Schritt.",
    applyMoveCount: "werden verschoben",
    applyKeepCount: "bleiben im aktuellen Ordner",
    applyNow: "Änderungen jetzt anwenden",
    applyRunningTitle: "Die Änderungen werden jetzt umgesetzt",
    applyRunningBody: "Mailflow arbeitet die freigegebenen Änderungen im Postfach ab. Der Fortschritt wird automatisch aktualisiert.",
    applyRunningButton: "Änderungen werden umgesetzt …",
    applyProgress: "Fortschritt",
    applyRemaining: "noch offen",
    applyMoved: "verschoben / angewendet",
    applySkipped: "ohne Änderung",
    applyFailed: "fehlgeschlagen",
    applyReview: "erneut zu prüfen",
    applyCompletedTitle: "Die Änderungen wurden umgesetzt",
    applyCompletedBody: "Der Apply-Lauf ist abgeschlossen.",
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
    showSubgroups: "Show and edit subgroups",
    subgroup: "Subgroup",
    editTarget: "Change target",
    saveTarget: "Save target",
    saving: "Saving …",
    unknownSender: "Unknown sender",
    examples: "Examples",
    noClusters: "No groups match this filter.",
    loading: "Compressing decisions …",
    missingParams: "Mailbox or job is missing.",
    approvedCount: "results approved",
    editedCount: "proposals updated",
    targetSavedPending: "Target saved. Review stays open until you explicitly confirm it.",
    pendingConfirmation: "Target changed · confirmation still pending",
    applyExisting: "An apply job already exists for this dry run.",
    applyReadyTitle: "Approved changes are ready – nothing has changed in the mailbox yet",
    applyReadyBody: "Confirming only approves decisions. Moving messages starts with the separate apply step.",
    applyMoveCount: "will be moved",
    applyKeepCount: "will stay in the current folder",
    applyNow: "Apply changes now",
    applyRunningTitle: "The changes are now being applied",
    applyRunningBody: "Mailflow is processing the approved mailbox changes. Progress updates automatically.",
    applyRunningButton: "Applying changes …",
    applyProgress: "Progress",
    applyRemaining: "remaining",
    applyMoved: "moved / applied",
    applySkipped: "without change",
    applyFailed: "failed",
    applyReview: "needs review again",
    applyCompletedTitle: "The changes have been applied",
    applyCompletedBody: "The apply job has finished.",
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
    showSubgroups: "Mostrar y editar subgrupos",
    subgroup: "Subgrupo",
    editTarget: "Cambiar destino",
    saveTarget: "Guardar destino",
    saving: "Guardando …",
    unknownSender: "Remitente desconocido",
    examples: "Ejemplos",
    noClusters: "No hay grupos para este filtro.",
    loading: "Agrupando decisiones …",
    missingParams: "Falta el buzón o el trabajo.",
    approvedCount: "resultados aprobados",
    editedCount: "propuestas actualizadas",
    targetSavedPending: "Destino guardado. La revisión sigue abierta hasta que la confirmes explícitamente.",
    pendingConfirmation: "Destino cambiado · confirmación pendiente",
    applyExisting: "Ya existe una aplicación para esta prueba.",
    applyReadyTitle: "Los cambios aprobados están listos – todavía no se ha cambiado el buzón",
    applyReadyBody: "Confirmar solo aprueba las decisiones. El movimiento real empieza con el paso de aplicación.",
    applyMoveCount: "se moverán",
    applyKeepCount: "permanecerán en la carpeta actual",
    applyNow: "Aplicar cambios ahora",
    applyRunningTitle: "Los cambios se están aplicando ahora",
    applyRunningBody: "Mailflow está procesando los cambios aprobados del buzón. El progreso se actualiza automáticamente.",
    applyRunningButton: "Aplicando cambios …",
    applyProgress: "Progreso",
    applyRemaining: "pendientes",
    applyMoved: "movidos / aplicados",
    applySkipped: "sin cambios",
    applyFailed: "fallidos",
    applyReview: "requieren nueva revisión",
    applyCompletedTitle: "Los cambios se han aplicado",
    applyCompletedBody: "El proceso de aplicación ha finalizado.",
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
  const [applyJob, setApplyJob] = useState<BulkApplyJob | null>(null);
  const [folders, setFolders] = useState<MailboxFolderView[]>([]);
  const [filter, setFilter] = useState<Filter>("review");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchApplyStatus = useCallback(async () => {
    if (!accountId || !jobId) return null;
    try {
      return await bulkReviewApi.applyStatus(accountId, jobId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }, [accountId, jobId]);

  const load = useCallback(async () => {
    if (!accountId || !jobId) return;
    setError(null);
    const [summaryResult, jobsResult, metadata, applyStatus] = await Promise.all([
      bulkReviewApi.summary(accountId, jobId),
      backfillApi.list(accountId),
      api.mailboxMetadata(accountId),
      fetchApplyStatus(),
    ]);
    setSummary(summaryResult);
    setJob(jobsResult.find((item) => item.id === jobId) ?? null);
    setApplyJob(applyStatus);
    setFolders(metadata.folders.filter((item) => item.selectable));
  }, [accountId, jobId, fetchApplyStatus]);

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

  useEffect(() => {
    if (applyJob?.state !== "running" || !accountId || !jobId) return;
    const timer = window.setInterval(() => {
      void Promise.all([
        bulkReviewApi.applyStatus(accountId, jobId),
        bulkReviewApi.summary(accountId, jobId),
      ])
        .then(([status, nextSummary]) => {
          setApplyJob(status);
          setSummary(nextSummary);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
        });
    }, 1200);
    return () => window.clearInterval(timer);
  }, [accountId, applyJob?.state, jobId]);

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

  async function editClusterTarget(clusterId: string, target: string) {
    if (!accountId || !jobId) return;
    const busyKey = `edit:${clusterId}`;
    setBusy(busyKey);
    setNotice(null);
    setError(null);
    try {
      const payload = target === "__keep__"
        ? { do_move: false }
        : { do_move: true, proposed_folder: target };
      const result = await bulkReviewApi.editCluster(accountId, jobId, clusterId, payload);
      setNotice(`${result.edited.toLocaleString()} ${copy.editedCount}. ${copy.targetSavedPending}`);
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
      setApplyJob(result.job);
      if (result.job.state === "paused" && result.job.last_error) {
        setError(result.job.last_error);
      }
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
  const approvedMoves = summary?.clusters.reduce(
    (sum, cluster) => sum + (cluster.action === "move" ? (cluster.statuses.approved ?? 0) : 0),
    0,
  ) ?? 0;
  const approvedKeeps = Math.max(0, approved - approvedMoves);
  const applyRunning = applyJob?.state === "running";
  const applyCompleted = applyJob?.state === "completed";
  const applyRemaining = applyJob ? Math.max(0, applyJob.approved - applyJob.processed) : 0;
  const applyPercent = applyJob?.approved
    ? Math.min(100, Math.round((applyJob.processed / applyJob.approved) * 100))
    : 0;
  const canRetryApply = applyJob?.state === "paused" && applyJob.last_error === "apply_enqueue_failed";
  const canApply = job?.state === "completed" && approved > 0 && (!applyJob || canRetryApply);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <Link href="/app/processing">← {copy.back}</Link>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
        <div className={styles.headerActions}>
          <button className="btn secondary" type="button" disabled={busy !== null || !summary?.safe || applyRunning} onClick={() => void approveSafe()}>
            {busy === "safe" ? copy.approving : copy.approveSafe}
          </button>
          <button className="btn" type="button" disabled={busy !== null || !canApply || applyRunning || applyCompleted} onClick={() => void startApply()}>
            {applyRunning ? copy.applyRunningButton : busy === "apply" ? copy.applying : copy.applyApproved}
          </button>
        </div>
      </header>

      {job?.state === "running" && <div className={styles.notice}>{copy.runningHint}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}
      {error && <div className={styles.error}>{error}</div>}

      {applyJob && (applyRunning || applyCompleted) && (
        <section className={`${styles.applyStatus} ${applyCompleted ? styles.applyStatusDone : ""}`}>
          <div className={styles.applyStatusHeader}>
            <div>
              <strong>{applyCompleted ? copy.applyCompletedTitle : copy.applyRunningTitle}</strong>
              <span>{applyCompleted ? copy.applyCompletedBody : copy.applyRunningBody}</span>
            </div>
            <span className={styles.applyPercent}>{applyPercent}%</span>
          </div>
          <div className={styles.progressTrack} aria-label={copy.applyProgress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={applyPercent} role="progressbar">
            <div className={styles.progressBar} style={{ width: `${applyPercent}%` }} />
          </div>
          <div className={styles.applyProgressMeta}>
            <span><strong>{applyJob.processed.toLocaleString()}</strong> / {applyJob.approved.toLocaleString()} {copy.applyProgress.toLowerCase()}</span>
            <span><strong>{applyRemaining.toLocaleString()}</strong> {copy.applyRemaining}</span>
          </div>
          <div className={styles.applyCounters}>
            <span><strong>{applyJob.applied.toLocaleString()}</strong> {copy.applyMoved}</span>
            <span><strong>{applyJob.skipped.toLocaleString()}</strong> {copy.applySkipped}</span>
            <span className={applyJob.failed > 0 ? styles.applyCounterDanger : ""}><strong>{applyJob.failed.toLocaleString()}</strong> {copy.applyFailed}</span>
            <span className={applyJob.review_required > 0 ? styles.applyCounterWarning : ""}><strong>{applyJob.review_required.toLocaleString()}</strong> {copy.applyReview}</span>
          </div>
          <button className="btn" type="button" disabled>
            {applyRunning ? copy.applyRunningButton : copy.applyCompletedTitle}
          </button>
        </section>
      )}

      {canApply && !applyRunning && !applyCompleted && (
        <section className={styles.applyReady}>
          <div>
            <strong>{copy.applyReadyTitle}</strong>
            <span>{copy.applyReadyBody}</span>
            <span className={styles.applyReadyCounts}>
              <strong>{approvedMoves.toLocaleString()}</strong> {copy.applyMoveCount}
              {" · "}
              <strong>{approvedKeeps.toLocaleString()}</strong> {copy.applyKeepCount}
            </span>
          </div>
          <button className="btn" type="button" disabled={busy !== null} onClick={() => void startApply()}>
            {busy === "apply" ? copy.applying : copy.applyNow}
          </button>
        </section>
      )}

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
                locale={locale}
                folders={folders}
                categoryLabel={enumLabel(t, "category", cluster.category)}
                onApprove={approveCluster}
                onEditTarget={editClusterTarget}
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

function FilterButton({ value, current, label, onChange }: { value: Filter; label: string; current: Filter; onChange: (value: Filter) => void }) {
  return <button type="button" className={`${styles.tab} ${current === value ? styles.tabActive : ""}`} onClick={() => onChange(value)}>{label}</button>;
}

function ClusterCard({
  cluster,
  busy,
  copy,
  locale,
  folders,
  categoryLabel,
  onApprove,
  onEditTarget,
}: {
  cluster: BulkReviewCluster;
  busy: string | null;
  copy: Copy;
  locale: Locale;
  folders: MailboxFolderView[];
  categoryLabel: string;
  onApprove: (id: string) => Promise<void>;
  onEditTarget: (id: string, target: string) => Promise<void>;
}) {
  const proposed = cluster.statuses.proposed ?? 0;
  const canApprove = proposed > 0 && cluster.suspicious < cluster.count;
  return (
    <article className={styles.cluster}>
      <div className={styles.clusterHeader}>
        <div className={styles.clusterMain}>
          <div className={styles.clusterTitle}><strong>{categoryLabel}</strong><span className={styles.count}>{cluster.count.toLocaleString()} Mails</span></div>
          <div className={styles.route}><span>{cluster.action === "move" ? copy.move : copy.keep}</span>{cluster.action === "move" && <><span className={styles.arrow}>→</span><span>{copy.target}: {displayFolder(cluster.destination, folders, locale)}</span></>}</div>
          <div className={styles.meta}>
            <span className={styles.pill}>{copy.confidence}: {Math.round(cluster.confidence_avg * 100)}%</span>
            {cluster.safe > 0 && <span className={`${styles.pill} ${styles.pillSuccess}`}>{cluster.safe.toLocaleString()} {copy.safe.toLowerCase()}</span>}
            {cluster.review_required > 0 && <span className={`${styles.pill} ${styles.pillReview}`}>{cluster.review_required.toLocaleString()} {copy.review.toLowerCase()}</span>}
            {cluster.suspicious > 0 && <span className={`${styles.pill} ${styles.pillDanger}`}>{cluster.suspicious.toLocaleString()} {copy.suspicious.toLowerCase()}</span>}
            {cluster.edited > 0 && proposed > 0 && <span className={`${styles.pill} ${styles.pillPending}`}>{copy.pendingConfirmation}</span>}
          </div>
        </div>
        <div className={styles.clusterActions}>
          <TargetEditor cluster={cluster} folders={folders} locale={locale} copy={copy} busy={busy} onSave={onEditTarget} />
          <button className="btn secondary" type="button" disabled={!canApprove || busy !== null} onClick={() => void onApprove(cluster.id)}>{busy === cluster.id ? copy.approving : copy.approveGroup}</button>
        </div>
      </div>
      {cluster.children.length > 0 && (
        <details className={styles.details}>
          <summary>
            <span className={styles.summaryChevron}>›</span>
            <strong>{cluster.children.length} {copy.showSubgroups}</strong>
          </summary>
          <div className={styles.children}>
            {cluster.children.map((child) => (
              <div className={styles.childBlock} key={child.id}>
                <div className={styles.child}>
                  <div className={styles.childIdentity}>
                    <strong className={styles.childDomain}>{senderGroupTitle(child, copy)}</strong>
                    <span className={styles.childMeta}>{senderGroupMeta(child, copy)}</span>
                    {child.edited > 0 && (child.statuses.proposed ?? 0) > 0 && <span className={`${styles.pill} ${styles.pillPending}`}>{copy.pendingConfirmation}</span>}
                  </div>
                  <TargetEditor cluster={child} folders={folders} locale={locale} copy={copy} busy={busy} onSave={onEditTarget} compact />
                  <button className="btn secondary" type="button" disabled={(child.statuses.proposed ?? 0) === 0 || child.suspicious >= child.count || busy !== null} onClick={() => void onApprove(child.id)}>{busy === child.id ? copy.approving : copy.approveDomain}</button>
                </div>
                {child.samples.length > 0 && (
                  <div className={styles.samples}>
                    <div className={styles.samplesLabel}>{copy.examples}</div>
                    {child.samples.map((sample) => <div className={styles.sample} key={sample.proposal_id}><span>{sample.from_email}</span><span title={sample.subject}>{sample.subject || "—"}</span><span>{Math.round(sample.confidence * 100)}%</span></div>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

function TargetEditor({
  cluster,
  folders,
  locale,
  copy,
  busy,
  onSave,
  compact = false,
}: {
  cluster: BulkReviewCluster;
  folders: MailboxFolderView[];
  locale: Locale;
  copy: Copy;
  busy: string | null;
  onSave: (id: string, target: string) => Promise<void>;
  compact?: boolean;
}) {
  const initial = cluster.action === "move" ? cluster.destination : "__keep__";
  const [target, setTarget] = useState(initial);
  useEffect(() => setTarget(initial), [initial]);
  const busyKey = `edit:${cluster.id}`;
  const changed = target !== initial;

  return (
    <div className={`${styles.targetEditor} ${compact ? styles.targetEditorCompact : ""}`}>
      <label>
        <span>{copy.editTarget}</span>
        <select value={target} disabled={busy !== null} onChange={(event) => setTarget(event.target.value)}>
          <option value="__keep__">{copy.keep}</option>
          {folders.map((folder) => (
            <option key={folder.name} value={folder.name}>{mailFolderLabel(folder, locale)}</option>
          ))}
          {cluster.action === "move" && cluster.destination && !folders.some((folder) => folder.name === cluster.destination) && (
            <option value={cluster.destination}>{cluster.destination}</option>
          )}
        </select>
      </label>
      <button className="btn secondary" type="button" disabled={!changed || busy !== null} onClick={() => void onSave(cluster.id, target)}>
        {busy === busyKey ? copy.saving : copy.saveTarget}
      </button>
    </div>
  );
}

function senderGroupTitle(cluster: BulkReviewCluster, copy: Copy): string {
  const sample = cluster.samples.find((item) => item.from_email.trim());
  const sender = sample?.from_email.trim() ?? "";
  const displayName = sender.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/)?.[1]?.trim();
  if (displayName && !displayName.includes("@")) return displayName;
  const domain = cleanSenderDomain(cluster.sender_domain);
  if (domain) return domain;
  return sender || copy.unknownSender;
}

function senderGroupMeta(cluster: BulkReviewCluster, copy: Copy): string {
  const domain = cleanSenderDomain(cluster.sender_domain);
  const prefix = domain ? `${domain} · ` : "";
  return `${prefix}${copy.subgroup} · ${cluster.count.toLocaleString()} Mails · ${copy.confidence}: ${Math.round(cluster.confidence_avg * 100)}%`;
}

function cleanSenderDomain(value: string | null): string {
  const domain = (value ?? "").trim().replace(/^@+/, "");
  return domain && domain !== "unknown" ? domain : "";
}

function displayFolder(name: string, folders: MailboxFolderView[], locale: Locale): string {
  const folder = folders.find((item) => item.name === name);
  return folder ? mailFolderLabel(folder, locale) : name;
}
