"use client";

import type {
  NotificationCenter,
  NotificationItem,
  NotificationPreference,
} from "@/lib/attention-api";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import { useMemo, useState } from "react";

const booleanPreferences = [
  "urgent_enabled",
  "security_review_enabled",
  "jobs_enabled",
  "mailbox_health_enabled",
  "daily_summary_enabled",
] as const;
type BooleanPreference = (typeof booleanPreferences)[number];
type Tab = "all" | "unread" | "security" | "system";

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
  const [tab, setTab] = useState<Tab>("all");
  const [showPreferences, setShowPreferences] = useState(false);
  const filtered = useMemo(() => {
    const rows = props.center?.notifications ?? [];
    if (tab === "unread") return rows.filter((item) => !item.read_at);
    if (tab === "security")
      return rows.filter(
        (item) =>
          item.severity === "security" ||
          item.event_type.includes("security") ||
          item.severity === "critical",
      );
    if (tab === "system")
      return rows.filter(
        (item) =>
          !(
            item.severity === "security" || item.event_type.includes("security")
          ),
      );
    return rows;
  }, [props.center, tab]);

  async function markAllRead() {
    const unread =
      props.center?.notifications.filter((item) => !item.read_at) ?? [];
    for (const item of unread) await props.onMarkRead(item.id);
  }

  return (
    <main style={{ width: "100%", padding: 24 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 20,
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>{t("nav.notifications")}</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            {t("notifications.description")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn secondary"
            type="button"
            onClick={() => setShowPreferences((value) => !value)}
          >
            {t("notifications.preferences")}
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={!props.center?.unread}
            onClick={() => void markAllRead()}
          >
            Mark all read
          </button>
        </div>
      </header>

      {props.error && (
        <div
          className="alert error"
          role="alert"
          style={{
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
          }}
        >
          <span>{props.error}</span>
          <button
            className="btn secondary"
            type="button"
            onClick={() => void props.onReload()}
          >
            {t("review.retry")}
          </button>
        </div>
      )}
      {showPreferences && props.preferences && (
        <PreferencesPanel {...props} preferences={props.preferences} />
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["all", "unread", "security", "system"] as Tab[]).map((item) => (
          <button
            key={item}
            className="btn secondary"
            type="button"
            onClick={() => setTab(item)}
            style={
              tab === item
                ? {
                    borderColor: "var(--mf-primary)",
                    background: "var(--mf-primary-soft)",
                    color: "var(--mf-primary)",
                  }
                : undefined
            }
          >
            {item === "all"
              ? "All"
              : item === "unread"
                ? `Unread${props.center ? ` (${props.center.unread})` : ""}`
                : item === "security"
                  ? "Security"
                  : "System"}
          </button>
        ))}
      </div>

      {!props.center && !props.error && (
        <div className="empty">{t("common.loading")}</div>
      )}
      {props.center && filtered.length === 0 && (
        <div className="empty">{t("notifications.empty")}</div>
      )}
      {props.center && filtered.length > 0 && (
        <div
          style={{
            border: "1px solid var(--mf-border)",
            borderRadius: 8,
            overflow: "hidden",
            background: "var(--mf-surface)",
            padding: "0 8px",
          }}
        >
          {filtered.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              onMarkRead={props.onMarkRead}
            />
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          marginTop: 18,
        }}
      >
        <Link className="btn secondary" href="/app/review">
          {t("nav.review")}
        </Link>
        <Link className="btn secondary" href="/app/daily-summary">
          {t("nav.dailySummary")}
        </Link>
      </div>
    </main>
  );
}

function PreferencesPanel(
  props: NotificationsUiProps & { preferences: NotificationPreference },
) {
  const { t } = useI18n();
  const labels: Record<BooleanPreference, string> = {
    urgent_enabled: t("notifications.urgentAction"),
    security_review_enabled: t("notifications.securityReview"),
    jobs_enabled: t("notifications.jobResult"),
    mailbox_health_enabled: t("notifications.mailboxHealth"),
    daily_summary_enabled: t("nav.dailySummary"),
  };
  return (
    <section
      style={{
        border: "1px solid var(--mf-border)",
        borderRadius: 8,
        background: "var(--mf-surface)",
        padding: 18,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5,minmax(0,1fr))",
          gap: 10,
        }}
      >
        {booleanPreferences.map((key) => (
          <label
            key={key}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              border: "1px solid var(--mf-border)",
              borderRadius: 6,
              padding: 10,
              fontSize: 12,
            }}
          >
            <input
              style={{ width: 16, minHeight: 16 }}
              type="checkbox"
              checked={props.preferences[key]}
              onChange={(event) =>
                props.onPatchPreferences({ [key]: event.target.checked })
              }
            />
            {labels[key]}
          </label>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "160px minmax(220px,1fr) auto",
          gap: 12,
          alignItems: "end",
          marginTop: 12,
        }}
      >
        <label className="field">
          <span>{t("notifications.summaryHour")}</span>
          <input
            type="number"
            min={0}
            max={23}
            value={props.preferences.daily_summary_hour}
            onChange={(event) =>
              props.onPatchPreferences({
                daily_summary_hour: Number(event.target.value),
              })
            }
          />
        </label>
        <label className="field">
          <span>{t("notifications.timezone")}</span>
          <input
            value={props.preferences.timezone}
            onChange={(event) =>
              props.onPatchPreferences({ timezone: event.target.value })
            }
          />
        </label>
        <button
          className="btn"
          type="button"
          disabled={props.saving}
          onClick={() => void props.onSavePreferences()}
        >
          {props.saving
            ? t("notifications.saving")
            : t("notifications.savePreferences")}
        </button>
      </div>
    </section>
  );
}

function NotificationRow({
  item,
  onMarkRead,
}: { item: NotificationItem; onMarkRead: (id: string) => Promise<void> }) {
  const { locale, t } = useI18n();
  const danger =
    item.severity === "critical" ||
    item.severity === "security" ||
    item.event_type.includes("security");
  const warning = item.severity === "warning";
  const indicator = danger
    ? "var(--mf-danger)"
    : warning
      ? "var(--mf-warning)"
      : "var(--mf-text-muted)";
  return (
    <article
      style={{
        display: "grid",
        gridTemplateColumns: "8px 36px minmax(0,1fr) auto 12px",
        gap: 14,
        alignItems: "start",
        padding: 16,
        borderBottom: "1px solid var(--mf-surface-muted)",
        opacity: item.read_at ? 0.72 : 1,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          background: indicator,
          marginTop: 8,
        }}
      />
      <span
        style={{
          width: 36,
          height: 36,
          display: "grid",
          placeItems: "center",
          borderRadius: 6,
          background: danger
            ? "var(--mf-danger-soft)"
            : "var(--mf-surface-muted)",
          color: danger ? "var(--mf-danger)" : "var(--mf-text-secondary)",
          fontWeight: 800,
        }}
      >
        {danger ? "!" : "■"}
      </span>
      <div>
        <strong style={{ display: "block", fontSize: 14 }}>{item.title}</strong>
        <p
          style={{
            margin: "5px 0 0",
            color: "var(--mf-text-secondary)",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          {item.body}
        </p>
        <div className="muted" style={{ marginTop: 5, fontSize: 11 }}>
          {item.event_type}
        </div>
      </div>
      <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
        {new Date(item.created_at).toLocaleString(locale)}
      </span>
      {!item.read_at ? (
        <button
          type="button"
          title={t("notifications.markRead")}
          onClick={() => void onMarkRead(item.id)}
          style={{
            width: 10,
            height: 10,
            border: 0,
            borderRadius: 5,
            background: "var(--mf-primary)",
            padding: 0,
            marginTop: 5,
          }}
        />
      ) : (
        <span />
      )}
    </article>
  );
}
