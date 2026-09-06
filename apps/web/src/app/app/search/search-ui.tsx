"use client";

import type { MessageSearchResult } from "@/lib/dashboard-api";
import { type TranslationKey, enumLabel } from "@/lib/i18n";
import type { EmailAccount } from "@/lib/types";
import Link from "next/link";
import { useState } from "react";
import styles from "./search.module.css";

export type SearchFilters = {
  q: string; sender: string; subject: string; account_id: string; category: string; subcategory: string;
  importance: string; urgency: string; action_required: string; review_required: string;
  suspicious_content: string; tag: string; destination_folder: string; classification_source: string;
  processed_state: string; date_from: string; date_to: string;
};
type T = (key: TranslationKey) => string;
type SetFilter = (key: keyof SearchFilters, value: string) => void;
type EnumGroup = "category" | "importance" | "urgency" | "action_required";
type SelectOption = { value: string; label: string };
const CATEGORIES = ["work", "private", "finance", "orders", "appointments", "newsletters", "notifications", "other"];
const IMPORTANCE = ["critical", "high", "normal", "low", "unknown"];
const URGENCY = ["immediate", "today", "this_week", "none", "unknown"];
const ACTION = ["yes", "no", "unknown"];

function TextField({ label, value, onChange, type }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className={styles.field}><span>{label}</span><input type={type ?? "text"} value={value} onChange={(event) => onChange(event.currentTarget.value)} /></label>; }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: SelectOption[]; onChange: (value: string) => void }) { return <label className={styles.field}><span>{label}</span><select value={value} onChange={(event) => onChange(event.currentTarget.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function enumOptions(t: T, group: EnumGroup, values: readonly string[]): SelectOption[] { return [{ value: "", label: t("common.all") }, ...values.map((value) => ({ value, label: enumLabel(t, group, value) }))]; }

function Filters({ filters, accounts, setFilter, t }: { filters: SearchFilters; accounts: EmailAccount[]; setFilter: SetFilter; t: T }) {
  return <div className={styles.filterGrid}>
    <SelectField label={t("search.mailbox")} value={filters.account_id} onChange={(value) => setFilter("account_id", value)} options={[{ value: "", label: t("common.all") }, ...accounts.map((account) => ({ value: account.id, label: account.username }))]} />
    <TextField label={t("search.sender")} value={filters.sender} onChange={(value) => setFilter("sender", value)} />
    <TextField label={t("search.subject")} value={filters.subject} onChange={(value) => setFilter("subject", value)} />
    <SelectField label={t("review.category")} value={filters.category} onChange={(value) => setFilter("category", value)} options={enumOptions(t, "category", CATEGORIES)} />
    <SelectField label={t("review.importance")} value={filters.importance} onChange={(value) => setFilter("importance", value)} options={enumOptions(t, "importance", IMPORTANCE)} />
    <SelectField label={t("review.urgency")} value={filters.urgency} onChange={(value) => setFilter("urgency", value)} options={enumOptions(t, "urgency", URGENCY)} />
    <SelectField label={t("review.actionRequired")} value={filters.action_required} onChange={(value) => setFilter("action_required", value)} options={enumOptions(t, "action_required", ACTION)} />
    <TextField label={t("review.subcategory")} value={filters.subcategory} onChange={(value) => setFilter("subcategory", value)} />
    <TextField label={t("search.from")} type="date" value={filters.date_from} onChange={(value) => setFilter("date_from", value)} />
    <TextField label={t("search.to")} type="date" value={filters.date_to} onChange={(value) => setFilter("date_to", value)} />
    <SelectField label={t("search.review")} value={filters.review_required} onChange={(value) => setFilter("review_required", value)} options={[{ value: "", label: t("common.all") }, { value: "true", label: t("search.required") }, { value: "false", label: t("search.notRequired") }]} />
    <SelectField label={t("search.security")} value={filters.suspicious_content} onChange={(value) => setFilter("suspicious_content", value)} options={[{ value: "", label: t("common.all") }, { value: "true", label: t("search.suspicious") }, { value: "false", label: t("search.normal") }]} />
    <TextField label={t("search.tag")} value={filters.tag} onChange={(value) => setFilter("tag", value)} />
    <TextField label={t("search.destinationFolder")} value={filters.destination_folder} onChange={(value) => setFilter("destination_folder", value)} />
    <SelectField label={t("search.classificationSource")} value={filters.classification_source} onChange={(value) => setFilter("classification_source", value)} options={[{ value: "", label: t("common.all") }, { value: "decision_memory", label: "DecisionMemory" }, { value: "fast_model", label: t("search.fastModel") }, { value: "deep_model", label: t("search.deepModel") }]} />
    <SelectField label={t("search.processingState")} value={filters.processed_state} onChange={(value) => setFilter("processed_state", value)} options={[{ value: "", label: t("common.all") }, ...["execute", "review", "pending", "queued", "deferred", "blocked", "failed", "error"].map((value) => ({ value, label: t(`processing.${value}` as TranslationKey) }))]} />
  </div>;
}

export function SearchFiltersPanel(props: { filters: SearchFilters; accounts: EmailAccount[]; loading: boolean; setFilter: SetFilter; onSearch: () => void; onReset: () => void; t: T }) {
  const [open, setOpen] = useState(false);
  const active = Object.entries(props.filters).filter(([key, value]) => key !== "q" && value).map(([key, value]) => `${key.replaceAll("_", " ")}: ${value}`);
  return <section className={styles.searchCard}>
    <div className={styles.heroRow}><span className={styles.searchDot}>●</span><input className={styles.heroInput} value={props.filters.q} onChange={(event) => props.setFilter("q", event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") props.onSearch(); }} placeholder={props.t("search.senderSubject")} aria-label={props.t("search.senderSubject")} />{props.filters.q && <button className={styles.clearButton} type="button" onClick={() => props.setFilter("q", "")} aria-label="Clear">×</button>}</div>
    <div className={styles.activeFilters}><strong>Active filters:</strong>{active.slice(0, 5).map((item) => <span className={styles.filterChip} key={item}>{item}</span>)}<button type="button" className={styles.moreFilters} onClick={() => setOpen((value) => !value)}>{open ? "Hide filters" : "+ Add more filters"}</button></div>
    {open && <Filters filters={props.filters} accounts={props.accounts} setFilter={props.setFilter} t={props.t} />}
    <div className={styles.filterActions}><button className="btn secondary" type="button" disabled={props.loading} onClick={props.onReset}>{props.t("search.reset")}</button><button className="btn" type="button" disabled={props.loading} onClick={props.onSearch}>{props.loading ? props.t("common.loading") : props.t("search.action")}</button></div>
  </section>;
}

function initials(value: string): string { return value.split(/[@._\s-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(""); }

export function SearchResults({ result, t }: { result: MessageSearchResult | null; t: T }) {
  if (result && result.items.length === 0) return <div className={styles.empty}>{t("search.noResults")}</div>;
  const mailboxes = new Set(result?.items.map((item) => item.account_id) ?? []).size;
  return <>
    <div className={styles.resultsMeta}><strong>{result?.total ?? 0} {t("search.results")}{result ? ` across ${mailboxes} mailbox${mailboxes === 1 ? "" : "es"}` : ""}</strong><span className={styles.sort}>{t("search.sortBy")}: <strong>{t("search.relevance")}</strong></span></div>
    <div className={styles.results}>{result?.items.map((item) => <Link className={styles.resultCard} key={item.id} href={`/app/mail?account=${encodeURIComponent(item.account_id)}&folder=${encodeURIComponent(item.folder)}&uid=${item.uid}`}>
      <div className={styles.resultTop}><div className={styles.senderWrap}><span className={styles.sender}>{item.from_email}</span><span className={styles.mailboxPill}>{item.account_label}</span></div><span className={styles.time}>{new Date(item.processed_at).toLocaleString()}</span></div>
      <p className={styles.subject}>{item.subject || t("review.noSubject")}</p>
      <div className={styles.resultBottom}><div className={styles.tags}><span className={`${styles.tag} ${styles.category}`}>{enumLabel(t, "category", item.category)}</span><span className={styles.meta}>{item.classification_source}</span>{item.review_required && <span className={styles.tag}>{t("review.title")}</span>}{item.suspicious_content && <span className={styles.tag}>{t("review.security")}</span>}</div><span className={styles.meta}>{enumLabel(t, "importance", item.importance)} · {enumLabel(t, "urgency", item.urgency)}</span></div>
      {item.destination_folder && <span className={styles.destination}>{item.destination_folder}</span>}
    </Link>)}</div>
  </>;
}
