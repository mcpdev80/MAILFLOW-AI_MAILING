"use client";

import type {
  OperationalReviewItem,
  ReviewCorrection,
  ReviewInbox,
  ReviewItem,
} from "@/lib/attention-api";
import { enumLabel, useI18n } from "@/lib/i18n";
import Link from "next/link";
import { useState } from "react";

const categories = [
  "work",
  "private",
  "finance",
  "orders",
  "appointments",
  "newsletters",
  "notifications",
  "other",
];
const importanceValues = ["critical", "high", "normal", "low", "unknown"];
const urgencyValues = ["immediate", "today", "this_week", "none", "unknown"];
const actionValues = ["yes", "no", "unknown"];

type ReviewUiProps = {
  data: ReviewInbox | null;
  error: string | null;
  busy: string | null;
  isEmpty: boolean;
  onApply: (item: ReviewItem, payload: ReviewCorrection) => Promise<void>;
  onRetry: (item: OperationalReviewItem) => Promise<void>;
  onReload: () => Promise<void>;
};

export function ReviewUi(props: ReviewUiProps) {
  const { t } = useI18n();
  return (
    <main className="container" style={{ maxWidth: 1440, margin: "0 auto" }}>
      <ReviewHeader />
      {props.error && (
        <ReviewError error={props.error} onReload={props.onReload} />
      )}
      {props.data && <CounterGrid data={props.data} />}
      {!props.data && !props.error && (
        <div className="card muted">{t("common.loading")}</div>
      )}
      {props.isEmpty && <div className="empty">{t("review.empty")}</div>}
      {props.data && <ReviewContent {...props} data={props.data} />}
    </main>
  );
}

function ReviewHeader() {
  const { t } = useI18n();
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        alignItems: "flex-start",
        marginBottom: 20,
      }}
    >
      <div>
        <h1 style={{ margin: 0 }}>{t("review.title")}</h1>
        <p className="muted" style={{ marginBottom: 0 }}>
          {t("review.description")}
        </p>
      </div>
      <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link className="btn secondary" href="/app/notifications">
          {t("nav.notifications")}
        </Link>
        <Link className="btn secondary" href="/app/daily-summary">
          {t("nav.dailySummary")}
        </Link>
        <Link className="btn secondary" href="/app/mail">
          {t("nav.mail")}
        </Link>
      </nav>
    </header>
  );
}

function ReviewError({
  error,
  onReload,
}: { error: string; onReload: () => Promise<void> }) {
  const { t } = useI18n();
  return (
    <div
      className="alert error"
      role="alert"
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "center",
      }}
    >
      <span>{error}</span>
      <button
        className="btn secondary"
        type="button"
        onClick={() => void onReload()}
      >
        {t("review.retry")}
      </button>
    </div>
  );
}

function CounterGrid({ data }: { data: ReviewInbox }) {
  const { t } = useI18n();
  const values = [
    [t("review.title"), data.counters.review_needed],
    [t("review.urgent"), data.counters.urgent],
    [t("review.actionRequired"), data.counters.action_required],
    [t("review.security"), data.counters.security],
    [t("review.failures"), data.counters.failures],
  ] as const;
  return (
    <section
      aria-label={t("review.title")}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 12,
        marginBottom: 24,
      }}
    >
      {values.map(([label, value]) => (
        <Counter key={label} label={label} value={value} />
      ))}
    </section>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <strong style={{ display: "block", fontSize: 24, lineHeight: 1.2 }}>
        {value}
      </strong>
      <span className="muted">{label}</span>
    </div>
  );
}

function ReviewContent(props: ReviewUiProps & { data: ReviewInbox }) {
  const { t } = useI18n();
  return (
    <div style={{ display: "grid", gap: 24 }}>
      {props.data.operational.length > 0 && (
        <section>
          <h2>{t("review.operational")}</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {props.data.operational.map((item) => (
              <OperationalCard
                key={`${item.source_type}-${item.id}`}
                item={item}
                busy={props.busy === item.id}
                onRetry={() => props.onRetry(item)}
              />
            ))}
          </div>
        </section>
      )}
      {props.data.items.length > 0 && (
        <section>
          <h2>{t("review.messages")}</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {props.data.items.map((item) => (
              <MessageReviewCard
                key={item.id}
                item={item}
                busy={props.busy === item.id}
                onApply={(payload) => props.onApply(item, payload)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function OperationalCard({
  item,
  busy,
  onRetry,
}: {
  item: OperationalReviewItem;
  busy: boolean;
  onRetry: () => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <article className="card">
      <CardTop
        badges={[item.source_type, item.account_label, item.status]}
        title={item.title}
        priority={item.priority}
      />
      <p>{item.reason}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {item.retry_available && item.job_id && (
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => void onRetry()}
          >
            {t("review.retry")}
          </button>
        )}
        {item.management_url && (
          <Link className="btn secondary" href={item.management_url}>
            {t("review.openManagement")}
          </Link>
        )}
      </div>
    </article>
  );
}

function MessageReviewCard({
  item,
  busy,
  onApply,
}: {
  item: ReviewItem;
  busy: boolean;
  onApply: (payload: ReviewCorrection) => Promise<void>;
}) {
  const { t } = useI18n();
  const badges = [item.review_type, item.account_label, item.ownership_mode];
  return (
    <article className="card">
      <CardTop
        badges={badges}
        title={item.subject || t("review.noSubject")}
        subtitle={item.from_email}
        priority={item.priority}
        danger={item.suspicious_content}
      />
      <p>{item.reason}</p>
      <ClassificationSummary item={item} />
      <ReviewEditor item={item} busy={busy} onApply={onApply} />
      <ReviewActions item={item} busy={busy} onApply={onApply} />
    </article>
  );
}

function CardTop({
  badges,
  title,
  subtitle,
  priority,
  danger,
}: {
  badges: string[];
  title: string;
  subtitle?: string;
  priority: number;
  danger?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        alignItems: "flex-start",
      }}
    >
      <div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {badges.map((badge) => (
            <span className="pill" key={badge}>
              {badge}
            </span>
          ))}
          {danger && (
            <span
              className="pill"
              style={{
                color: "var(--mf-danger)",
                background: "var(--mf-danger-soft)",
              }}
            >
              {t("review.security")}
            </span>
          )}
        </div>
        <h3 style={{ marginBottom: 4 }}>{title}</h3>
        {subtitle && <div className="muted">{subtitle}</div>}
      </div>
      <strong style={{ whiteSpace: "nowrap" }}>
        {t("review.priority")} {priority}
      </strong>
    </div>
  );
}

function ClassificationSummary({ item }: { item: ReviewItem }) {
  const { t } = useI18n();
  const rows = [
    `${enumLabel(t, "category", item.category)}${item.subcategory ? ` / ${item.subcategory}` : ""}`,
    `${t("review.importance")}: ${enumLabel(t, "importance", item.importance)}`,
    `${t("review.urgency")}: ${enumLabel(t, "urgency", item.urgency)}`,
    `${t("review.actionRequired")}: ${enumLabel(t, "action_required", item.action_required)}`,
    `${t("review.confidence")}: ${Math.round(item.confidence * 100)}%`,
  ];
  return (
    <div
      className="muted"
      style={{ display: "flex", gap: 16, flexWrap: "wrap" }}
    >
      {rows.map((row) => (
        <span key={row}>{row}</span>
      ))}
    </div>
  );
}

function ReviewEditor({
  item,
  busy,
  onApply,
}: {
  item: ReviewItem;
  busy: boolean;
  onApply: (payload: ReviewCorrection) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => correctionFrom(item));
  const { t } = useI18n();
  return (
    <details style={{ marginTop: 16 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>
        {t("review.correct")}
      </summary>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
          marginTop: 12,
        }}
      >
        <SelectField
          label={t("review.category")}
          value={draft.category ?? ""}
          values={categories}
          labelFor={(v) => enumLabel(t, "category", v)}
          onChange={(category) => setDraft({ ...draft, category })}
        />
        <TextField
          label={t("review.subcategory")}
          value={draft.subcategory ?? ""}
          onChange={(subcategory) =>
            setDraft({ ...draft, subcategory: subcategory || null })
          }
        />
        <SelectField
          label={t("review.importance")}
          value={draft.importance ?? ""}
          values={importanceValues}
          labelFor={(v) => enumLabel(t, "importance", v)}
          onChange={(importance) => setDraft({ ...draft, importance })}
        />
        <SelectField
          label={t("review.urgency")}
          value={draft.urgency ?? ""}
          values={urgencyValues}
          labelFor={(v) => enumLabel(t, "urgency", v)}
          onChange={(urgency) => setDraft({ ...draft, urgency })}
        />
        <SelectField
          label={t("review.actionRequired")}
          value={draft.action_required ?? ""}
          values={actionValues}
          labelFor={(v) => enumLabel(t, "action_required", v)}
          onChange={(action_required) =>
            setDraft({ ...draft, action_required })
          }
        />
        <TextField
          label={t("review.destination")}
          value={draft.destination_folder ?? ""}
          onChange={(destination_folder) =>
            setDraft({ ...draft, destination_folder })
          }
        />
      </div>
      <label
        style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}
      >
        <input
          type="checkbox"
          checked={draft.remember ?? false}
          onChange={(event) =>
            setDraft({ ...draft, remember: event.target.checked })
          }
        />
        {t("review.remember")}
      </label>
      <button
        className="btn"
        type="button"
        disabled={busy}
        style={{ marginTop: 12 }}
        onClick={() => void onApply(draft)}
      >
        {t("review.saveCorrection")}
      </button>
    </details>
  );
}

function SelectField({
  label,
  value,
  values,
  labelFor,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  labelFor: (value: string) => string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="muted" style={{ display: "block", marginBottom: 4 }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ width: "100%" }}
      >
        {values.map((option) => (
          <option key={option} value={option}>
            {labelFor(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="muted" style={{ display: "block", marginBottom: 4 }}>
        {label}
      </span>
      <input
        value={value}
        maxLength={255}
        onChange={(event) => onChange(event.target.value)}
        style={{ width: "100%" }}
      />
    </label>
  );
}

function ReviewActions({
  item,
  busy,
  onApply,
}: {
  item: ReviewItem;
  busy: boolean;
  onApply: (payload: ReviewCorrection) => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
      {item.action_review_required && (
        <button
          className="btn"
          type="button"
          disabled={busy}
          onClick={() =>
            void onApply({ routing_decision: "approve", remember: false })
          }
        >
          {t("review.approveRouting")}
        </button>
      )}
      {item.action_review_required && (
        <button
          className="btn secondary"
          type="button"
          disabled={busy}
          onClick={() =>
            void onApply({ routing_decision: "reject", remember: false })
          }
        >
          {t("review.rejectRouting")}
        </button>
      )}
      <button
        className="btn secondary"
        type="button"
        disabled={busy}
        onClick={() => void onApply({ dismiss: true, remember: false })}
      >
        {t("review.dismiss")}
      </button>
      <Link
        className="btn secondary"
        href={`/app/mail?account=${encodeURIComponent(item.account_id)}&folder=${encodeURIComponent(item.folder)}&uid=${item.uid}`}
      >
        {t("review.openMessage")}
      </Link>
    </div>
  );
}

function correctionFrom(item: ReviewItem): ReviewCorrection {
  return {
    category: item.category,
    subcategory: item.subcategory,
    importance: item.importance,
    urgency: item.urgency,
    action_required: item.action_required,
    destination_folder: item.destination_folder,
    remember: true,
  };
}
