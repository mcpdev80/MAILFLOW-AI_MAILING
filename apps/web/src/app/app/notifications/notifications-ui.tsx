"use client";

import {
  type NotificationCenter,
  type NotificationItem,
  type NotificationPreference,
} from "@/lib/attention-api";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";

const booleanPreferences = [
  "urgent_enabled",
  "security_review_enabled",
  "jobs_enabled",
  "mailbox_health_enabled",
  "daily_summary_enabled",
] as const;

type BooleanPreference = (typeof booleanPreferences)[number];

type NotificationsUiProps = {
  center: NotificationCenter | null;
  preferences: NotificationPreference | null;
  error: string | null;
  saving: boolean;
  onReload: () => Promise<void>;
  onMarkRead: (id: string) => Promise<void>;
  onSavePreferences: () => Promise<void>;
  onPatchPreferences: (patch: Partial<NotificationPreference>) => void;
};

export function NotificationsUi(props: NotificationsUiProps) {
  const { t } = useI18n();
  return (
    <main className="container" style={{ maxWidth: 1440, margin: "0 auto" }}>
      <NotificationsHeader />
      {props.error && <ErrorBanner error={props.error} onReload={props.onReload} />}
      {props.preferences && <PreferencesCard {...props} preferences={props.preferences} />}
      <section>
        <h2>{t("notifications.inbox")} {props.center ? `(${props.center.unread} ${t("notifications.unread")})` : ""}</h2>
        {!props.center && !props.error && <div className="card muted">{t("common.loading")}</div>}
        {props.center?.notifications.length === 0 && <div className="empty">{t("notifications.empty")}</div>}
        <NotificationList center={props.center} onMarkRead={props.onMarkRead} />
      </section>
    </main>
  );
}

function NotificationsHeader() {
  const { t } = useI18n();
  return (
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>{t("nav.notifications")}</h1>
        <p className="muted" style={{ marginBottom: 0 }}>{t("notifications.description")}</p>
      </div>
      <nav style={{ display: "flex", gap: 8 }}>
        <Link className="btn secondary" href="/app/review">{t("nav.review")}</Link>
        <Link className="btn secondary" href="/app/daily-summary">{t("nav.dailySummary")}</Link>
      </nav>
    </header>
  );
}

function ErrorBanner({ error, onReload }: { error: string; onReload: () => Promise<void> }) {
  const { t } = useI18n();
  return (
    <div className="alert error" role="alert" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
      <span>{error}</span>
      <button className="btn secondary" type="button" onClick={() => void onReload()}>{t("review.retry")}</button>
    </div>
  );
}

function PreferencesCard(props: NotificationsUiProps & { preferences: NotificationPreference }) {
  const { t } = useI18n();
  const labels: Record<BooleanPreference, string> = {
    urgent_enabled: t("notifications.urgentAction"),
    security_review_enabled: t("notifications.securityReview"),
    jobs_enabled: t("notifications.jobResult"),
    mailbox_health_enabled: t("notifications.mailboxHealth"),
    daily_summary_enabled: t("nav.dailySummary"),
  };
  return (
    <section className="card" style={{ marginBottom: 24 }}>
      <h2 style={{ marginTop: 0 }}>{t("notifications.preferences")}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {booleanPreferences.map((key) => (
          <ToggleRow key={key} label={labels[key]} checked={props.preferences[key]} onChange={(checked) => props.onPatchPreferences({ [key]: checked })} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 14 }}>
        <NumberPreference preferences={props.preferences} onPatch={props.onPatchPreferences} />
        <TimezonePreference preferences={props.preferences} onPatch={props.onPatchPreferences} />
      </div>
      <button className="btn" type="button" disabled={props.saving} style={{ marginTop: 14 }} onClick={() => void props.onSavePreferences()}>
        {props.saving ? t("notifications.saving") : t("notifications.savePreferences")}
      </button>
    </section>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="card" style={{ display: "flex", gap: 10, alignItems: "center", padding: 12 }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function NumberPreference({ preferences, onPatch }: { preferences: NotificationPreference; onPatch: (patch: Partial<NotificationPreference>) => void }) {
  const { t } = useI18n();
  return (
    <label>
      <span className="muted" style={{ display: "block", marginBottom: 4 }}>{t("notifications.summaryHour")}</span>
      <input type="number" min={0} max={23} value={preferences.daily_summary_hour} onChange={(event) => onPatch({ daily_summary_hour: Number(event.target.value) })} style={{ width: "100%" }} />
    </label>
  );
}

function TimezonePreference({ preferences, onPatch }: { preferences: NotificationPreference; onPatch: (patch: Partial<NotificationPreference>) => void }) {
  const { t } = useI18n();
  return (
    <label>
      <span className="muted" style={{ display: "block", marginBottom: 4 }}>{t("notifications.timezone")}</span>
      <input value={preferences.timezone} onChange={(event) => onPatch({ timezone: event.target.value })} style={{ width: "100%" }} />
    </label>
  );
}

function NotificationList({ center, onMarkRead }: { center: NotificationCenter | null; onMarkRead: (id: string) => Promise<void> }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {center?.notifications.map((item) => <NotificationCard key={item.id} item={item} onMarkRead={onMarkRead} />)}
    </div>
  );
}

function NotificationCard({ item, onMarkRead }: { item: NotificationItem; onMarkRead: (id: string) => Promise<void> }) {
  const { t, locale } = useI18n();
  return (
    <article className="card" style={{ opacity: item.read_at ? 0.72 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div>
          <span className="pill">{item.severity}</span>
          <h3 style={{ marginBottom: 4 }}>{item.title}</h3>
          <p style={{ margin: 0 }}>{item.body}</p>
          <div className="muted" style={{ marginTop: 8 }}>{new Date(item.created_at).toLocaleString(locale)}</div>
        </div>
        {!item.read_at && <button className="btn secondary" type="button" onClick={() => void onMarkRead(item.id)}>{t("notifications.markRead")}</button>}
      </div>
    </article>
  );
}
