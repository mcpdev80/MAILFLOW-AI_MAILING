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

type DashboardState = ReturnType<typeof useDashboard>;

function classificationRate(processed: number, classified: number): string {
  if (processed <= 0) return "0%";
  return `${Math.min(100, Math.round((classified / processed) * 100))}%`;
}

export default function DashboardPage() {
  const state = useDashboard();
  return (
    <main className={styles.page}>
      <DashboardHeader state={state} />
      <DashboardNotices state={state} />
      {state.overview && <DashboardContent state={state} />}
    </main>
  );
}

function DashboardHeader({ state }: { state: DashboardState }) {
  const { t } = useI18n();
  return (
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
            {days === 1
              ? t("dashboard.today")
              : `${days} ${t("dashboard.days")}`}
          </button>
        ))}
      </div>
    </header>
  );
}

function DashboardNotices({ state }: { state: DashboardState }) {
  const { t } = useI18n();
  return (
    <>
      {state.error && <div className={styles.error}>{state.error}</div>}
      {state.notice && (
        <div
          className={state.notice === "queued" ? styles.notice : styles.error}
        >
          {state.notice === "queued"
            ? t("dashboard.cycleEnqueued")
            : t("dashboard.cycleFailed")}
        </div>
      )}
      {!state.overview && !state.error && (
        <div className={styles.empty}>{t("common.loading")}</div>
      )}
      {state.overview?.inference_warning && (
        <div className={styles.error}>{state.overview.inference_warning}</div>
      )}
    </>
  );
}

function DashboardContent({ state }: { state: DashboardState }) {
  const overview = state.overview!;
  return (
    <>
      <DashboardKpis state={state} />
      <DashboardMiniStats state={state} />
      <DashboardGrid state={state} />
    </>
  );
}

function DashboardKpis({ state }: { state: DashboardState }) {
  const { t } = useI18n();
  const counters = state.overview!.counters;
  return (
    <section className={styles.kpiRow}>
      <KpiCard
        label={t("dashboard.processedToday")}
        value={counters.processed_today}
      />
      <KpiCard
        label={t("dashboard.waiting")}
        value={counters.pending_or_queued}
      />
      <KpiCard
        label={t("dashboard.reviewRequired")}
        value={counters.review_required}
        href="/app/search?review_required=true"
        accent
      />
      <KpiCard
        label={t("dashboard.actionRequired")}
        value={counters.action_required}
        href="/app/search?action_required=yes"
      />
    </section>
  );
}

function DashboardMiniStats({ state }: { state: DashboardState }) {
  const { t } = useI18n();
  const counters = state.overview!.counters;
  const classified =
    counters.decision_memory + counters.fast_model + counters.deep_model;
  return (
    <section className={styles.miniRow}>
      <MiniCard
        label={t("dashboard.failedDeferred")}
        value={counters.failed_or_deferred}
      />
      <MiniCard
        label={t("dashboard.autoMoved")}
        value={counters.automated_actions}
      />
      <MiniCard
        label={t("dashboard.autoClassified")}
        value={classificationRate(counters.processed_range, classified)}
      />
    </section>
  );
}

function DashboardGrid({ state }: { state: DashboardState }) {
  const { t } = useI18n();
  const overview = state.overview!;
  return (
    <section className={styles.split}>
      <div className={styles.column}>
        <TrendCard points={overview.trend} t={t} />
        <CategoryCard items={overview.categories} t={t} />
      </div>
      <div className={styles.column}>
        <ReviewCard
          items={state.review?.items ?? []}
          overview={overview}
          t={t}
        />
        <MailboxSection state={state} />
      </div>
    </section>
  );
}

function MailboxSection({ state }: { state: DashboardState }) {
  const { t } = useI18n();
  const mailboxes = state.overview!.mailboxes;
  return (
    <section className={styles.mailboxSection}>
      <h2>{t("dashboard.mailboxConnections")}</h2>
      <div className={styles.mailboxList}>
        {mailboxes.length === 0 && (
          <div className={styles.empty}>
            {t("dashboard.noMailboxesConnected")}
          </div>
        )}
        {mailboxes.map((mailbox) => (
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
  );
}
