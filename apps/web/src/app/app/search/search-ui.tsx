"use client";

import type { MessageSearchResult } from "@/lib/dashboard-api";
import { type TranslationKey, enumLabel } from "@/lib/i18n";
import type { EmailAccount } from "@/lib/types";
import Link from "next/link";
import styles from "./search.module.css";

export type SearchFilters = {
  q: string;
  sender: string;
  subject: string;
  account_id: string;
  category: string;
  subcategory: string;
  importance: string;
  urgency: string;
  action_required: string;
  review_required: string;
  suspicious_content: string;
  tag: string;
  destination_folder: string;
  classification_source: string;
  processed_state: string;
  date_from: string;
  date_to: string;
};

type T = (key: TranslationKey) => string;
type SetFilter = (key: keyof SearchFilters, value: string) => void;
type EnumGroup = "category" | "importance" | "urgency" | "action_required";

type SelectOption = { value: string; label: string };
const CATEGORIES = [
  "work",
  "private",
  "finance",
  "orders",
  "appointments",
  "newsletters",
  "notifications",
  "other",
];
const IMPORTANCE = ["critical", "high", "normal", "low", "unknown"];
const URGENCY = ["immediate", "today", "this_week", "none", "unknown"];
const ACTION = ["yes", "no", "unknown"];

function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className={styles.field}>
      <span>{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span>{props.label}</span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function enumOptions(
  t: T,
  group: EnumGroup,
  values: readonly string[],
): SelectOption[] {
  return [
    { value: "", label: t("common.all") },
    ...values.map((value) => ({ value, label: enumLabel(t, group, value) })),
  ];
}

function PrimaryFilters(props: {
  filters: SearchFilters;
  accounts: EmailAccount[];
  setFilter: SetFilter;
  t: T;
}) {
  const { filters, accounts, setFilter, t } = props;
  return (
    <>
      <SelectField
        label={t("search.mailbox")}
        value={filters.account_id}
        onChange={(value) => setFilter("account_id", value)}
        options={[
          { value: "", label: t("common.all") },
          ...accounts.map((account) => ({
            value: account.id,
            label: account.username,
          })),
        ]}
      />
      <TextField
        label={t("search.sender")}
        value={filters.sender}
        onChange={(value) => setFilter("sender", value)}
      />
      <TextField
        label={t("search.subject")}
        value={filters.subject}
        onChange={(value) => setFilter("subject", value)}
      />
      <TextField
        label={t("search.from")}
        type="date"
        value={filters.date_from}
        onChange={(value) => setFilter("date_from", value)}
      />
      <TextField
        label={t("search.to")}
        type="date"
        value={filters.date_to}
        onChange={(value) => setFilter("date_to", value)}
      />
      <SelectField
        label={t("review.category")}
        value={filters.category}
        onChange={(value) => setFilter("category", value)}
        options={enumOptions(t, "category", CATEGORIES)}
      />
      <TextField
        label={t("review.subcategory")}
        value={filters.subcategory}
        onChange={(value) => setFilter("subcategory", value)}
      />
      <SelectField
        label={t("review.importance")}
        value={filters.importance}
        onChange={(value) => setFilter("importance", value)}
        options={enumOptions(t, "importance", IMPORTANCE)}
      />
      <SelectField
        label={t("review.urgency")}
        value={filters.urgency}
        onChange={(value) => setFilter("urgency", value)}
        options={enumOptions(t, "urgency", URGENCY)}
      />
      <SelectField
        label={t("review.actionRequired")}
        value={filters.action_required}
        onChange={(value) => setFilter("action_required", value)}
        options={enumOptions(t, "action_required", ACTION)}
      />
    </>
  );
}

function AdvancedFilters(props: {
  filters: SearchFilters;
  setFilter: SetFilter;
  t: T;
}) {
  const { filters, setFilter, t } = props;
  return (
    <>
      <SelectField
        label={t("search.review")}
        value={filters.review_required}
        onChange={(value) => setFilter("review_required", value)}
        options={[
          { value: "", label: t("common.all") },
          { value: "true", label: t("search.required") },
          { value: "false", label: t("search.notRequired") },
        ]}
      />
      <SelectField
        label={t("search.security")}
        value={filters.suspicious_content}
        onChange={(value) => setFilter("suspicious_content", value)}
        options={[
          { value: "", label: t("common.all") },
          { value: "true", label: t("search.suspicious") },
          { value: "false", label: t("search.normal") },
        ]}
      />
      <TextField
        label={t("search.tag")}
        value={filters.tag}
        onChange={(value) => setFilter("tag", value)}
      />
      <TextField
        label={t("search.destinationFolder")}
        value={filters.destination_folder}
        onChange={(value) => setFilter("destination_folder", value)}
      />
      <SelectField
        label={t("search.classificationSource")}
        value={filters.classification_source}
        onChange={(value) => setFilter("classification_source", value)}
        options={[
          { value: "", label: t("common.all") },
          { value: "decision_memory", label: "DecisionMemory" },
          { value: "fast_model", label: t("search.fastModel") },
          { value: "deep_model", label: t("search.deepModel") },
        ]}
      />
      <SelectField
        label={t("search.processingState")}
        value={filters.processed_state}
        onChange={(value) => setFilter("processed_state", value)}
        options={[
          { value: "", label: t("common.all") },
          ...[
            "execute",
            "review",
            "pending",
            "queued",
            "deferred",
            "blocked",
            "failed",
            "error",
          ].map((value) => ({
            value,
            label: t(`processing.${value}` as TranslationKey),
          })),
        ]}
      />
    </>
  );
}

export function SearchFiltersPanel(props: {
  filters: SearchFilters;
  accounts: EmailAccount[];
  loading: boolean;
  setFilter: SetFilter;
  onSearch: () => void;
  onReset: () => void;
  t: T;
}) {
  return (
    <section className={styles.searchCard}>
      <input
        className={styles.heroInput}
        value={props.filters.q}
        onChange={(event) => props.setFilter("q", event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") props.onSearch();
        }}
        placeholder={props.t("search.senderSubject")}
        aria-label={props.t("search.senderSubject")}
      />
      <div className={styles.filterGrid}>
        <PrimaryFilters {...props} />
        <AdvancedFilters {...props} />
        <div className={styles.filterActions}>
          <button
            className="btn secondary"
            type="button"
            disabled={props.loading}
            onClick={props.onReset}
          >
            {props.t("search.reset")}
          </button>
          <button
            className="btn"
            type="button"
            disabled={props.loading}
            onClick={props.onSearch}
          >
            {props.loading
              ? props.t("common.loading")
              : props.t("search.action")}
          </button>
        </div>
      </div>
    </section>
  );
}

function initials(value: string): string {
  return value
    .split(/[@._\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function SearchResults({
  result,
  t,
}: { result: MessageSearchResult | null; t: T }) {
  if (result && result.items.length === 0) {
    return <div className={styles.empty}>{t("search.noResults")}</div>;
  }
  return (
    <>
      <div className={styles.resultsMeta}>
        <strong>
          {result?.total ?? 0} {t("search.results")}
        </strong>
        <span className={styles.sort}>
          {t("search.sortBy")}: <strong>{t("search.relevance")}</strong>
        </span>
      </div>
      <div className={styles.results}>
        {result?.items.map((item) => (
          <Link
            className={styles.resultCard}
            key={item.id}
            href={`/app/mail?account=${encodeURIComponent(item.account_id)}&folder=${encodeURIComponent(item.folder)}&uid=${item.uid}`}
          >
            <div className={styles.resultTop}>
              <div className={styles.senderWrap}>
                <span className={styles.avatar}>
                  {initials(item.from_email)}
                </span>
                <span className={styles.sender}>{item.from_email}</span>
                <span className={styles.mailboxPill}>{item.account_label}</span>
              </div>
              <span className={styles.time}>
                {new Date(item.processed_at).toLocaleString()}
              </span>
            </div>
            <p className={styles.subject}>
              {item.subject || t("review.noSubject")}
            </p>
            <div className={styles.resultBottom}>
              <div className={styles.tags}>
                <span className={`${styles.tag} ${styles.category}`}>
                  {enumLabel(t, "category", item.category)}
                </span>
                <span className={styles.tag}>
                  {enumLabel(t, "importance", item.importance)}
                </span>
                <span className={styles.tag}>
                  {enumLabel(t, "urgency", item.urgency)}
                </span>
                {item.review_required && (
                  <span className={styles.tag}>{t("review.title")}</span>
                )}
                {item.suspicious_content && (
                  <span className={styles.tag}>{t("review.security")}</span>
                )}
              </div>
              <span className={styles.meta}>
                {item.classification_source} · {item.processed_state}
              </span>
            </div>
            {item.destination_folder && (
              <span className={styles.destination}>
                {item.destination_folder}
              </span>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}
