"use client";

import type { MessageSearchResult } from "@/lib/dashboard-api";
import { enumLabel, type TranslationKey } from "@/lib/i18n";
import type { EmailAccount } from "@/lib/types";
import Link from "next/link";

export type SearchFilters = {
  q: string;
  sender: string;
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

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function enumOptions(t: T, group: string, values: string[]) {
  return [
    { value: "", label: t("common.all") },
    ...values.map((value) => ({ value, label: enumLabel(t, group, value) })),
  ];
}

function SearchPrimaryFilters({
  filters,
  accounts,
  setFilter,
  t,
}: {
  filters: SearchFilters;
  accounts: EmailAccount[];
  setFilter: SetFilter;
  t: T;
}) {
  return (
    <>
      <TextField label={t("search.senderSubject")} value={filters.q} onChange={(v) => setFilter("q", v)} />
      <TextField label={t("search.sender")} value={filters.sender} onChange={(v) => setFilter("sender", v)} />
      <SelectField
        label={t("search.mailbox")}
        value={filters.account_id}
        onChange={(v) => setFilter("account_id", v)}
        options={[
          { value: "", label: t("common.all") },
          ...accounts.map((a) => ({ value: a.id, label: a.username })),
        ]}
      />
      <SelectField label={t("review.category")} value={filters.category} onChange={(v) => setFilter("category", v)} options={enumOptions(t, "category", CATEGORIES)} />
      <TextField label={t("review.subcategory")} value={filters.subcategory} onChange={(v) => setFilter("subcategory", v)} />
      <SelectField label={t("review.importance")} value={filters.importance} onChange={(v) => setFilter("importance", v)} options={enumOptions(t, "importance", IMPORTANCE)} />
      <SelectField label={t("review.urgency")} value={filters.urgency} onChange={(v) => setFilter("urgency", v)} options={enumOptions(t, "urgency", URGENCY)} />
      <SelectField label={t("review.actionRequired")} value={filters.action_required} onChange={(v) => setFilter("action_required", v)} options={enumOptions(t, "action_required", ACTION)} />
    </>
  );
}

function SearchAdvancedFilters({
  filters,
  setFilter,
  t,
}: {
  filters: SearchFilters;
  setFilter: SetFilter;
  t: T;
}) {
  return (
    <>
      <SelectField label={t("search.review")} value={filters.review_required} onChange={(v) => setFilter("review_required", v)} options={[
        { value: "", label: t("common.all") },
        { value: "true", label: t("search.required") },
        { value: "false", label: t("search.notRequired") },
      ]} />
      <SelectField label={t("search.security")} value={filters.suspicious_content} onChange={(v) => setFilter("suspicious_content", v)} options={[
        { value: "", label: t("common.all") },
        { value: "true", label: t("search.suspicious") },
        { value: "false", label: t("search.normal") },
      ]} />
      <SelectField label={t("search.processingState")} value={filters.processed_state} onChange={(v) => setFilter("processed_state", v)} options={[
        { value: "", label: t("common.all") },
        ...["execute", "review", "pending", "queued", "deferred", "blocked", "failed", "error"].map((value) => ({ value, label: t(`processing.${value}` as TranslationKey) })),
      ]} />
      <SelectField label={t("search.classificationSource")} value={filters.classification_source} onChange={(v) => setFilter("classification_source", v)} options={[
        { value: "", label: t("common.all") },
        { value: "decision_memory", label: "DecisionMemory" },
        { value: "fast_model", label: t("search.fastModel") },
        { value: "deep_model", label: t("search.deepModel") },
      ]} />
      <TextField label={t("search.tag")} value={filters.tag} onChange={(v) => setFilter("tag", v)} />
      <TextField label={t("search.destinationFolder")} value={filters.destination_folder} onChange={(v) => setFilter("destination_folder", v)} />
      <TextField label={t("search.from")} type="date" value={filters.date_from} onChange={(v) => setFilter("date_from", v)} />
      <TextField label={t("search.to")} type="date" value={filters.date_to} onChange={(v) => setFilter("date_to", v)} />
    </>
  );
}

export function SearchFiltersPanel({
  filters,
  accounts,
  loading,
  setFilter,
  onSearch,
  t,
}: {
  filters: SearchFilters;
  accounts: EmailAccount[];
  loading: boolean;
  setFilter: SetFilter;
  onSearch: () => void;
  t: T;
}) {
  return (
    <section className="card">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.65rem" }}>
        <SearchPrimaryFilters filters={filters} accounts={accounts} setFilter={setFilter} t={t} />
        <SearchAdvancedFilters filters={filters} setFilter={setFilter} t={t} />
      </div>
      <button type="button" className="btn" style={{ marginTop: "0.75rem" }} disabled={loading} onClick={onSearch}>
        {loading ? t("common.loading") : t("search.action")}
      </button>
    </section>
  );
}

export function SearchResults({ result, t }: { result: MessageSearchResult | null; t: T }) {
  return (
    <>
      <div style={{ margin: "1rem 0" }}>
        <strong>{result?.total ?? 0}</strong> {t("search.results")}
      </div>
      <div style={{ display: "grid", gap: "0.65rem" }}>
        {result?.items.map((item) => (
          <article className="card" key={item.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <strong>{item.subject || t("review.noSubject")}</strong>
                <div className="muted">{item.from_email} · {item.account_label} · {new Date(item.processed_at).toLocaleString()}</div>
              </div>
              <Link className="btn secondary" href={`/app/mail?account=${encodeURIComponent(item.account_id)}&folder=${encodeURIComponent(item.folder)}&uid=${item.uid}`}>
                {t("review.openMessage")}
              </Link>
            </div>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
              <span className="pill">{enumLabel(t, "category", item.category)}</span>
              <span className="pill">{enumLabel(t, "importance", item.importance)}</span>
              <span className="pill">{enumLabel(t, "urgency", item.urgency)}</span>
              <span className="pill">{item.classification_source}</span>
              <span className="pill">{item.processed_state}</span>
              {item.review_required && <span className="pill">{t("review.title")}</span>}
              {item.suspicious_content && <span className="pill off">{t("review.security")}</span>}
            </div>
            <div className="muted" style={{ marginTop: "0.45rem" }}>{item.destination_folder}</div>
          </article>
        ))}
      </div>
    </>
  );
}
