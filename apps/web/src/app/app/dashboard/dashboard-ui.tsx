"use client";

import type { ReviewItem } from "@/lib/attention-api";
import type {
  DashboardBreakdownItem,
  DashboardMailboxStatus,
  DashboardOverview,
  DashboardTrendPoint,
} from "@/lib/dashboard-api";
import { enumLabel, type TranslationKey } from "@/lib/i18n";
import Link from "next/link";
import styles from "./dashboard.module.css";

type T = (key: TranslationKey) => string;

export function KpiCard(props: {
  label: string;
  value: number;
  href?: string;
  accent?: boolean;
}) {
  const content = (
    <>
      <span className={styles.kpiLabel}>{props.label}</span>
      <strong className={styles.kpiValue}>{props.value.toLocaleString()}</strong>
    </>
  );
  const className = `${styles.kpiCard} ${props.accent ? styles.kpiCardAccent : ""}`;
  return props.href ? (
    <Link className={className} href={props.href}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function MiniCard(props: { label: string; value: string | number }) {
  return (
    <div className={styles.miniCard}>
      <span className={styles.miniIcon} aria-hidden="true" />
      <div>
        <div className={styles.miniLabel}>{props.label}</div>
        <div className={styles.miniValue}>{props.value}</div>
      </div>
    </div>
  );
}

function trendPoints(points: DashboardTrendPoint[]): string {
  if (!points.length) return "";
  const max = Math.max(...points.map((point) => point.processed), 1);
  return points
    .map((point, index) => {
      const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
      const y = 92 - (point.processed / max) * 78;
      return `${x},${y}`;
    })
    .join(" ");
}

export function TrendCard(props: { points: DashboardTrendPoint[]; t: T }) {
  const first = props.points[0]?.day ?? "";
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2>{props.t("dashboard.trend")}</h2>
      </div>
      <svg className={styles.trend} viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline className={styles.trendLine} points={trendPoints(props.points)} />
      </svg>
      <div className={styles.trendLabels}>
        <span>{first}</span>
        <span>{props.t("dashboard.today")}</span>
      </div>
    </section>
  );
}

export function CategoryCard(props: {
  items: DashboardBreakdownItem[];
  t: T;
}) {
  const total = Math.max(props.items.reduce((sum, item) => sum + item.count, 0), 1);
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2>{props.t("dashboard.categories")}</h2>
      </div>
      <div className={styles.distribution}>
        {props.items.map((item) => {
          const percent = Math.round((item.count / total) * 100);
          return (
            <Link
              key={item.key}
              className={styles.distributionRow}
              href={`/app/search?category=${encodeURIComponent(item.key)}`}
            >
              <div className={styles.distributionMeta}>
                <span>{enumLabel(props.t, "category", item.key)}</span>
                <strong>{percent}%</strong>
              </div>
              <div className={styles.barTrack}>
                <div className={styles.bar} style={{ width: `${percent}%` }} />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function ReviewCard(props: {
  items: ReviewItem[];
  overview: DashboardOverview;
  t: T;
}) {
  const denominator = Math.max(props.overview.counters.processed_range, 1);
  const rate = ((props.overview.counters.review_required / denominator) * 100).toFixed(2);
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2>{props.t("dashboard.needsReview")}</h2>
        <span className={styles.reviewRate}>{rate}% {props.t("dashboard.reviewRate")}</span>
      </div>
      <div className={styles.reviewList}>
        {props.items.length === 0 && <div className={styles.empty}>{props.t("dashboard.noReview")}</div>}
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
            <span className={styles.confidence}>{Math.round(item.confidence * 100)}%</span>
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
    : props.t("dashboard.never");
  return (
    <div className={styles.mailboxCard}>
      <div className={styles.mailboxHeader}>
        <div className={styles.mailboxNameWrap}>
          <span
            className={`${styles.healthDot} ${
              props.mailbox.health === "healthy" ? "" : styles.healthDotWarn
            }`}
          />
          <Link className={styles.mailboxName} href={`/app/accounts/${props.mailbox.account_id}`}>
            {props.mailbox.label}
          </Link>
        </div>
        <button className="btn secondary" type="button" disabled={props.running} onClick={props.onRun}>
          {props.running ? props.t("dashboard.running") : props.t("dashboard.runNow")}
        </button>
      </div>
      <div className={styles.mailboxMeta}>
        <span>{props.t("dashboard.lastSynced")}: {lastSync}</span>
        <span className={styles.counts}>
          <span className={styles.countPill}>{props.mailbox.pending_count} {props.t("dashboard.pending")}</span>
          <span className={styles.countPill}>{props.mailbox.review_count} {props.t("dashboard.review")}</span>
        </span>
      </div>
    </div>
  );
}
