"use client";

import type { ReviewItem } from "@/lib/attention-api";
import type {
  DashboardBreakdownItem,
  DashboardMailboxStatus,
  DashboardOverview,
  DashboardTrendPoint,
} from "@/lib/dashboard-api";
import { type TranslationKey, enumLabel } from "@/lib/i18n";
import Link from "next/link";
import styles from "./dashboard.module.css";

type T = (key: TranslationKey) => string;

export function StatCard(props: {
  label: string;
  value: number | string;
  detail?: string;
  href?: string;
  tone?: "default" | "attention" | "danger";
}) {
  const className = `${styles.statCard} ${
    props.tone === "attention"
      ? styles.statAttention
      : props.tone === "danger"
        ? styles.statDanger
        : ""
  }`;
  const content = (
    <>
      <span className={styles.statLabel}>{props.label}</span>
      <strong className={styles.statValue}>{props.value}</strong>
      {props.detail && <span className={styles.statDetail}>{props.detail}</span>}
    </>
  );
  return props.href ? (
    <Link className={className} href={props.href}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function AttentionCard(props: {
  overview: DashboardOverview;
  t: T;
}) {
  const counters = props.overview.counters;
  const total =
    counters.review_required +
    counters.action_required +
    counters.failed_or_deferred;
  const clear = total === 0 && !props.overview.inference_warning;

  return (
    <section
      className={`${styles.attentionCard} ${clear ? styles.attentionClear : styles.attentionOpen}`}
    >
      <div className={styles.attentionLead}>
        <span className={styles.statusIcon} aria-hidden="true">
          {clear ? "✓" : "!"}
        </span>
        <div>
          <h2>
            {clear
              ? props.t("dashboard.allClear")
              : props.t("dashboard.attention")}
          </h2>
          <p>
            {clear
              ? props.t("dashboard.allClearDetail")
              : props.t("dashboard.attentionDetail")}
          </p>
        </div>
      </div>
      {!clear && (
        <div className={styles.attentionLinks}>
          <Link href="/app/review">
            <strong>{counters.review_required}</strong>
            <span>{props.t("dashboard.openReview")}</span>
          </Link>
          <Link href="/app/search?action_required=yes">
            <strong>{counters.action_required}</strong>
            <span>{props.t("dashboard.openActions")}</span>
          </Link>
          <Link href="/app/search?processed_state=failed">
            <strong>{counters.failed_or_deferred}</strong>
            <span>{props.t("dashboard.openFailures")}</span>
          </Link>
        </div>
      )}
    </section>
  );
}

export function TrendCard(props: { points: DashboardTrendPoint[]; t: T }) {
  const max = Math.max(...props.points.map((point) => point.processed), 1);
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{props.t("dashboard.trend")}</h2>
          <p>{props.t("dashboard.processedPeriod")}</p>
        </div>
      </div>
      <div className={styles.activityChart}>
        {props.points.map((point) => {
          const height = Math.max(8, Math.round((point.processed / max) * 100));
          return (
            <div className={styles.activityColumn} key={point.day}>
              <div className={styles.activityTrack}>
                <div
                  className={styles.activityBar}
                  style={{ height: `${height}%` }}
                  title={`${point.processed} ${props.t("dashboard.processed")}, ${point.review} ${props.t("dashboard.review")}, ${point.failures} ${props.t("dashboard.failures")}`}
                />
              </div>
              <span>{point.day.slice(5)}</span>
            </div>
          );
        })}
        {props.points.length === 0 && (
          <div className={styles.empty}>{props.t("dashboard.processedPeriod")}: 0</div>
        )}
      </div>
    </section>
  );
}

export function CategoryCard(props: {
  items: DashboardBreakdownItem[];
  t: T;
}) {
  const total = Math.max(
    props.items.reduce((sum, item) => sum + item.count, 0),
    1,
  );
  const items = props.items.slice(0, 6);
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2>{props.t("dashboard.categories")}</h2>
      </div>
      <div className={styles.distribution}>
        {items.map((item) => {
          const percent = Math.round((item.count / total) * 100);
          return (
            <Link
              key={item.key}
              className={styles.distributionRow}
              href={`/app/search?category=${encodeURIComponent(item.key)}`}
            >
              <div className={styles.distributionMeta}>
                <span>{enumLabel(props.t, "category", item.key)}</span>
                <span>
                  <strong>{percent}%</strong> · {item.count}
                </span>
              </div>
              <div className={styles.barTrack}>
                <div className={styles.bar} style={{ width: `${percent}%` }} />
              </div>
            </Link>
          );
        })}
        {items.length === 0 && <div className={styles.empty}>—</div>}
      </div>
    </section>
  );
}

export function AutomationCard(props: {
  overview: DashboardOverview;
  t: T;
}) {
  const counters = props.overview.counters;
  const classified =
    counters.decision_memory + counters.fast_model + counters.deep_model;
  const denominator = Math.max(counters.processed_range, 1);
  const rate = Math.min(100, Math.round((classified / denominator) * 100));
  const rows = [
    [props.t("dashboard.decisionMemory"), counters.decision_memory],
    [props.t("dashboard.fastModel"), counters.fast_model],
    [props.t("dashboard.deepModel"), counters.deep_model],
    [props.t("dashboard.autoMoved"), counters.automated_actions],
  ] as const;

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{props.t("dashboard.automation")}</h2>
          <p>{props.t("dashboard.automationDetail")}</p>
        </div>
        <strong className={styles.automationRate}>{rate}%</strong>
      </div>
      <div className={styles.automationTrack}>
        <div className={styles.automationFill} style={{ width: `${rate}%` }} />
      </div>
      <div className={styles.automationGrid}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value.toLocaleString()}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ReviewCard(props: { items: ReviewItem[]; t: T }) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2>{props.t("dashboard.needsReview")}</h2>
        {props.items.length > 0 && (
          <Link className={styles.textLink} href="/app/review">
            {props.t("dashboard.viewAll")}
          </Link>
        )}
      </div>
      <div className={styles.reviewList}>
        {props.items.length === 0 && (
          <div className={styles.compactEmpty}>
            <span aria-hidden="true">✓</span>
            {props.t("dashboard.noReview")}
          </div>
        )}
        {props.items.slice(0, 3).map((item) => (
          <Link
            key={item.id}
            className={styles.reviewRow}
            href={`/app/mail?account=${encodeURIComponent(item.account_id)}&folder=${encodeURIComponent(item.folder)}&uid=${item.uid}`}
          >
            <div className={styles.reviewInfo}>
              <div className={styles.reviewSubject}>{item.subject}</div>
              <div className={styles.reviewMeta}>
                <span>{enumLabel(props.t, "category", item.category)}</span>
                <span>{item.reason}</span>
              </div>
            </div>
            <span className={styles.confidence}>
              {Math.round(item.confidence * 100)}%
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function MailboxCard(props: {
  mailbox: DashboardMailboxStatus;
  running: boolean;
  onRun: () => void;
  t: T;
}) {
  const lastSync = props.mailbox.last_cycle_at
    ? new Date(props.mailbox.last_cycle_at).toLocaleString()
    : "—";
  const healthy = props.mailbox.health === "healthy";
  const backfill =
    props.mailbox.backfill_total && props.mailbox.backfill_total > 0
      ? `${props.mailbox.backfill_processed ?? 0} / ${props.mailbox.backfill_total}`
      : null;

  return (
    <div className={styles.mailboxCard}>
      <div className={styles.mailboxHeader}>
        <div className={styles.mailboxIdentity}>
          <span
            className={`${styles.healthDot} ${healthy ? "" : styles.healthDotWarn}`}
          />
          <div>
            <Link
              className={styles.mailboxName}
              href={`/app/accounts/${props.mailbox.account_id}`}
            >
              {props.mailbox.label}
            </Link>
            <div className={styles.mailboxHealth}>
              {healthy
                ? props.t("dashboard.mailboxHealthy")
                : props.t("dashboard.mailboxWarning")}
            </div>
          </div>
        </div>
        <button
          className={styles.runButton}
          type="button"
          disabled={props.running}
          onClick={props.onRun}
          title={props.t("dashboard.runNow")}
          aria-label={props.t("dashboard.runNow")}
        >
          {props.running ? "…" : "↻"}
        </button>
      </div>
      <div className={styles.mailboxStats}>
        <div>
          <span>{props.t("dashboard.lastSynced")}</span>
          <strong>{lastSync}</strong>
        </div>
        <div>
          <span>{props.t("dashboard.processedToday")}</span>
          <strong>{props.mailbox.processed_today}</strong>
        </div>
        <div>
          <span>{props.t("dashboard.review")}</span>
          <strong>{props.mailbox.review_count}</strong>
        </div>
        {backfill && (
          <div>
            <span>{props.t("dashboard.backfill")}</span>
            <strong>{backfill}</strong>
          </div>
        )}
      </div>
      {props.mailbox.last_error && (
        <div className={styles.mailboxError}>{props.mailbox.last_error}</div>
      )}
    </div>
  );
}
