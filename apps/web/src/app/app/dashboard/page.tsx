"use client";

import { useI18n } from "@/lib/i18n";
import {
  CategoryCard,
  KpiCard,
  MailboxCard,
  MiniCard,
  ReviewCard,
  TrendCard,
} from "./dashboard-ui";
import styles from "./dashboard.module.css";
import { useDashboard } from "./use-dashboard";

function classificationRate(processed: number, classified: number): string {
  if (processed <= 0) return "0%";
  return `${Math.min(100, Math.round((classified / processed) * 100))}%`;
}

export default function DashboardPage() {
  const { t } = useI18n();
  const state = useDashboard();
  const overview = state.overview;
  const classified = overview
    ? overview.counters.decision_memory + overview.counters.fast_model + overview.counters.deep_model
    : 0;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{t("nav.dashboard")}</h1>
          <p>{t("dashboard.overview")}</p>
        </div>
        <div className={styles.range}>
          {[1, 7, 30].map((days) => (
            <button
              type="button"
              key={days}
              className={state.rangeDays === days ? styles.rangeActive : ""}
              onClick={() => state.setRangeDays(days)}
            >
              {days === 1 ? t("dashboard.today") : `${days} ${t("dashboard.days")}`}
            </button>
          ))}
        </div>
      </header>

      {state.error && <div className={styles.error}>{state.error}</div>}
      {state.notice && (
        <div className={state.notice === "queued" ? styles.notice : styles.error}>
          {state.notice === "queued" ? t("dashboard.cycleEnqueued") : t("dashboard.cycleFailed")}
        </div>
      )}
      {!overview && !state.error && <div className={styles.empty}>{t("common.loading")}</div>}

      {overview && (
        <>
          {overview.inference_warning && <div className={styles.error}>{overview.inference_warning}</div>}
          <section className={styles.kpiRow}>
            <KpiCard label={t("dashboard.processedToday")} value={overview.counters.processed_today} />
            <KpiCard label={t("dashboard.waiting")} value={overview.counters.pending_or_queued} />
            <KpiCard
              label={t("dashboard.reviewRequired")}
              value={overview.counters.review_required}
              href="/app/search?review_required=true"
              accent
            />
            <KpiCard
              label={t("dashboard.actionRequired")}
              value={overview.counters.action_required}
              href="/app/search?action_required=yes"
            />
          </section>

          <section className={styles.miniRow}>
            <MiniCard label={t("dashboard.failedDeferred")} value={overview.counters.failed_or_deferred} />
            <MiniCard label={t("dashboard.autoMoved")} value={overview.counters.automated_actions} />
            <MiniCard
              label={t("dashboard.autoClassified")}
              value={classificationRate(overview.counters.processed_range, classified)}
            />
          </section>

          <section className={styles.split}>
            <div className={styles.column}>
              <TrendCard points={overview.trend} t={t} />
              <CategoryCard items={overview.categories} t={t} />
            </div>
            <div className={styles.column}>
              <ReviewCard items={state.review?.items ?? []} overview={overview} t={t} />
              <section className={styles.mailboxSection}>
                <h2>{t("dashboard.mailboxConnections")}</h2>
                <div className={styles.mailboxList}>
                  {overview.mailboxes.length === 0 && (
                    <div className={styles.empty}>{t("dashboard.noMailboxesConnected")}</div>
                  )}
                  {overview.mailboxes.map((mailbox) => (
                    <MailboxCard
                      key={mailbox.account_id}
                      mailbox={mailbox}
                      running={state.runningId === mailbox.account_id}
                      onRun={() => state.runNow(mailbox.account_id)}
                      t={t}
                    />
                  ))}
                </div>
              </section>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
