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
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <main style={{ width: "100%", padding: 24 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 20,
          marginBottom: 18,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>{t("review.title")}</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            {t("review.description")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn secondary" href="/app/notifications">
            {t("nav.notifications")}
          </Link>
          <Link className="btn secondary" href="/app/daily-summary">
            {t("nav.dailySummary")}
          </Link>
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

      {props.data && <CounterPills data={props.data} />}
      {!props.data && !props.error && (
        <div className="empty">{t("common.loading")}</div>
      )}
      {props.isEmpty && <div className="empty">{t("review.empty")}</div>}

      {props.data && props.data.items.length > 0 && (
        <section
          style={{
            marginTop: 16,
            border: "1px solid var(--mf-border)",
            borderRadius: 8,
            overflow: "hidden",
            background: "var(--mf-surface)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(280px,1fr) 190px 130px 160px 90px",
              gap: 16,
              alignItems: "center",
              padding: "11px 16px",
              background: "var(--mf-surface-muted)",
              color: "var(--mf-text-muted)",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            <span>Sender / Subject</span>
            <span>Proposed category</span>
            <span>Confidence</span>
            <span>Reason for review</span>
            <span style={{ textAlign: "right" }}>Time</span>
          </div>
          {props.data.items.map((item) => (
            <ReviewRow
              key={item.id}
              item={item}
              busy={props.busy === item.id}
              expanded={expanded === item.id}
              onToggle={() =>
                setExpanded((current) => (current === item.id ? null : item.id))
              }
              onApply={(payload) => props.onApply(item, payload)}
            />
          ))}
        </section>
      )}

      {props.data && props.data.operational.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>
            {t("review.operational")}
          </h2>
          <div
            style={{
              border: "1px solid var(--mf-border)",
              borderRadius: 8,
              overflow: "hidden",
              background: "var(--mf-surface)",
            }}
          >
            {props.data.operational.map((item) => (
              <OperationalRow
                key={`${item.source_type}-${item.id}`}
                item={item}
                busy={props.busy === item.id}
                onRetry={() => props.onRetry(item)}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function CounterPills({ data }: { data: ReviewInbox }) {
  const { t } = useI18n();
  const values = [
    [data.counters.review_needed, t("review.title"), "var(--mf-warning)"],
    [data.counters.urgent, t("review.urgent"), "var(--mf-danger)"],
    [data.counters.security, t("review.security"), "var(--mf-danger)"],
    [data.counters.failures, t("review.failures"), "var(--mf-text-muted)"],
    [
      data.counters.action_required,
      t("review.actionRequired"),
      "var(--mf-primary)",
    ],
  ] as const;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {values.map(([value, label, color]) => (
        <span
          key={label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            minHeight: 31,
            border: `1px solid ${color}`,
            borderRadius: 999,
            padding: "5px 11px",
            background: "var(--mf-surface)",
            color: "var(--mf-text-secondary)",
            fontSize: 12,
          }}
        >
          <strong style={{ color }}>{value}</strong>
          {label}
        </span>
      ))}
    </div>
  );
}

function ReviewRow({
  item,
  busy,
  expanded,
  onToggle,
  onApply,
}: {
  item: ReviewItem;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onApply: (payload: ReviewCorrection) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const confidence = Math.round(item.confidence * 100);
  const confidenceColor =
    confidence >= 85
      ? "var(--mf-success)"
      : confidence >= 60
        ? "var(--mf-warning)"
        : "var(--mf-danger)";
  const category = `${enumLabel(t, "category", item.category)}${item.subcategory ? ` / ${item.subcategory}` : ""}`;
  return (
    <article
      style={{
        borderTop: "1px solid var(--mf-border)",
        background: expanded ? "var(--mf-primary-soft)" : "var(--mf-surface)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "minmax(280px,1fr) 190px 130px 160px 90px",
          gap: 16,
          alignItems: "center",
          border: 0,
          background: "transparent",
          padding: "13px 16px",
          textAlign: "left",
          color: "inherit",
        }}
      >
        <span style={{ minWidth: 0 }}>
          <strong
            style={{
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 13,
            }}
          >
            {item.subject || t("review.noSubject")}
          </strong>
          <span
            className="muted"
            style={{
              display: "block",
              marginTop: 3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 12,
            }}
          >
            {item.from_email} · {item.account_label}
          </span>
        </span>
        <span>
          <span className="pill">{category}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 58,
              height: 6,
              borderRadius: 3,
              background: "var(--mf-surface-muted)",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                display: "block",
                width: `${confidence}%`,
                maxWidth: "100%",
                height: "100%",
                borderRadius: 3,
                background: confidenceColor,
              }}
            />
          </span>
          <strong style={{ fontSize: 12, color: confidenceColor }}>
            {confidence}%
          </strong>
        </span>
        <span>
          <span
            className="pill"
            style={
              item.suspicious_content
                ? {
                    background: "var(--mf-danger-soft)",
                    color: "var(--mf-danger)",
                  }
                : undefined
            }
          >
            {item.suspicious_content ? t("review.security") : item.review_type}
          </span>
        </span>
        <span className="muted" style={{ textAlign: "right", fontSize: 12 }}>
          {new Date(item.processed_at).toLocaleTimeString(locale, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </button>
      {expanded && (
        <div style={{ padding: "0 16px 16px 32px" }}>
          <div
            style={{
              border: "1px solid var(--mf-border)",
              borderRadius: 6,
              background: "var(--mf-surface)",
              padding: 12,
              marginBottom: 12,
            }}
          >
            <div
              className="muted"
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                marginBottom: 7,
              }}
            >
              Reason for review
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              {item.reason || "—"}
            </div>
          </div>
          <ClassificationSummary item={item} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 14,
            }}
          >
            <ReviewEditor item={item} busy={busy} onApply={onApply} />
            <ReviewActions item={item} busy={busy} onApply={onApply} />
          </div>
        </div>
      )}
    </article>
  );
}

function OperationalRow({
  item,
  busy,
  onRetry,
}: {
  item: OperationalReviewItem;
  busy: boolean;
  onRetry: () => Promise<void>;
}) {
  const { locale, t } = useI18n();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(260px,1fr) 160px 160px auto",
        gap: 16,
        alignItems: "center",
        padding: "14px 16px",
        borderTop: "1px solid var(--mf-border)",
      }}
    >
      <div>
        <strong style={{ fontSize: 13 }}>{item.title}</strong>
        <div className="muted" style={{ marginTop: 3, fontSize: 12 }}>
          {item.reason}
        </div>
      </div>
      <span className="pill">{item.source_type}</span>
      <span className="muted" style={{ fontSize: 12 }}>
        {new Date(item.created_at).toLocaleString(locale)}
      </span>
      <div style={{ display: "flex", gap: 8 }}>
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
    </div>
  );
}

function ClassificationSummary({ item }: { item: ReviewItem }) {
  const { t } = useI18n();
  const rows = [
    `${t("review.importance")}: ${enumLabel(t, "importance", item.importance)}`,
    `${t("review.urgency")}: ${enumLabel(t, "urgency", item.urgency)}`,
    `${t("review.actionRequired")}: ${enumLabel(t, "action_required", item.action_required)}`,
    item.destination_folder
      ? `${t("review.destination")}: ${item.destination_folder}`
      : null,
  ].filter(Boolean) as string[];
  return (
    <div
      className="muted"
      style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12 }}
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
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => correctionFrom(item));
  const { t } = useI18n();
  if (!open)
    return (
      <button
        className="btn secondary"
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        {t("review.correct")}
      </button>
    );
  return (
    <div
      style={{
        width: "100%",
        border: "1px solid var(--mf-border)",
        borderRadius: 8,
        background: "var(--mf-surface)",
        padding: 14,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,minmax(160px,1fr))",
          gap: 10,
        }}
      >
        <SelectField
          label={t("review.category")}
          value={draft.category ?? ""}
          values={categories}
          labelFor={(value) => enumLabel(t, "category", value)}
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
          labelFor={(value) => enumLabel(t, "importance", value)}
          onChange={(importance) => setDraft({ ...draft, importance })}
        />
        <SelectField
          label={t("review.urgency")}
          value={draft.urgency ?? ""}
          values={urgencyValues}
          labelFor={(value) => enumLabel(t, "urgency", value)}
          onChange={(urgency) => setDraft({ ...draft, urgency })}
        />
        <SelectField
          label={t("review.actionRequired")}
          value={draft.action_required ?? ""}
          values={actionValues}
          labelFor={(value) => enumLabel(t, "action_required", value)}
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 12,
        }}
      >
        <label
          style={{
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            fontSize: 12,
          }}
        >
          <input
            style={{ width: 16, minHeight: 16 }}
            type="checkbox"
            checked={draft.remember ?? false}
            onChange={(event) =>
              setDraft({ ...draft, remember: event.target.checked })
            }
          />
          {t("review.remember")}
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn secondary"
            type="button"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => void onApply(draft)}
          >
            {t("review.saveCorrection")}
          </button>
        </div>
      </div>
    </div>
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
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button
        className="btn"
        type="button"
        disabled={busy}
        onClick={() =>
          void onApply({
            category: item.category,
            subcategory: item.subcategory,
            importance: item.importance,
            urgency: item.urgency,
            action_required: item.action_required,
            destination_folder: item.destination_folder,
            remember: true,
          })
        }
      >
        Confirm Classification
      </button>
      {item.action_review_required && (
        <button
          className="btn secondary"
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
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
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
    <label className="field">
      <span>{label}</span>
      <input
        value={value}
        maxLength={255}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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
