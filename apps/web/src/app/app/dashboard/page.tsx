"use client";

import { useI18n } from "@/lib/i18n";
import {
  AttentionCard,
  AutomationCard,
  CategoryCard,
  MailboxCard,
  ReviewCard,
  StatCard,
  TrendCard,
} from "./dashboard-ui";
import styles from "./dashboard.module.css";
import { useDashboard } from "./use-dashboard";

type DashboardState = ReturnType<typeof useDashboard>;

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
      <div className={styles.range} aria-label={t("dashboard.trend")}>
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
  );
}

function DashboardNotices({ state }: { state: DashboardState }) {
  const { t } = useI18n();
  return (
    <>
      {state.error && <div className={styles.error}>{state.error}</div>}
      {state.notice && (
        <div className={state.notice === "queued" ? styles.notice : styles.error}>
          {state.notice === "queued"
            ? t("dashboard.cycleEnqueued")
            : t("dashboard.cycleFailed")}
        </div>
      )}
      {!state.overview && !state.error && (
        <div className={styles.empty}>{t("common.loading")}</div>
      )}
    </>
  );
}

function DashboardContent({ state }: { state: DashboardState }) {
  const { t } = useI18n();
  const overview = state.overview;
  if (!overview) return null;
  const counters = overview.counters;
  const processedLabel =
    state.rangeDays === 1
      ? t("dashboard.processedToday")
      : t("dashboard.processedPeriod");

  return (
    <>
      <AttentionCard overview={overview} t={t} />

      <section className={styles.statGrid}>
        <StatCard label={processedLabel} value={counters.processed_range} />
        <StatCard
          label={t("dashboard.reviewRequired")}
          value={counters.review_required}
          href="/app/review"
          tone={counters.review_required > 0 ? "attention" : "default"}
        />
        <StatCard
          label={t("dashboard.actionRequired")}
          value={counters.action_required}
          href="/app/search?action_required=yes"
          tone={counters.action_required > 0 ? "attention" : "default"}
        />
        <StatCard
          label={t("dashboard.waiting")}
          value={counters.pending_or_queued}
          tone={counters.pending_or_queued > 0 ? "attention" : "default"}
        />
      </section>

      <section className={styles.mainGrid}>
        <div className={styles.primaryColumn}>
          <TrendCard points={overview.trend} t={t} />
          <CategoryCard items={overview.categories} t={t} />
        </div>
        <div className={styles.secondaryColumn}>
          <AutomationCard overview={overview} t={t} />
          <ReviewCard items={state.review?.items ?? []} t={t} />
        </div>
      </section>

      <MailboxSection state={state} />
    </>
  );
}

function MailboxSection({ state }: { state: DashboardState }) {
  const { t } = useI18n();
  const overview = state.overview;
  if (!overview) return null;

  return (
    <section className={styles.mailboxSection}>
      <div className={styles.sectionHeader}>
        <h2>{t("dashboard.mailboxConnections")}</h2>
        {overview.counters.active_backfills > 0 && (
          <span className={styles.sectionMeta}>
            {overview.counters.active_backfills} {t("dashboard.activeBackfills")}
          </span>
        )}
      </div>
      <div className={styles.mailboxGrid}>
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
  );
}
