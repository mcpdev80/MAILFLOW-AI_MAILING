"use client";

import page from "@/components/figma-page.module.css";
import { api } from "@/lib/api";
import { createDecisionMemory } from "@/lib/decision-memory-api";
import { type TranslationKey, useI18n } from "@/lib/i18n";
import type { DecisionMemoryEntry, DecisionMemoryWrite, EmailAccount } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";

interface MemoryWithMailbox extends DecisionMemoryEntry {
  mailboxLabel: string;
}

type Translator = (key: TranslationKey) => string;

const emptyWrite: DecisionMemoryWrite = {
  sender_email: null,
  sender_domain: null,
  subject_pattern: null,
  thread_id: null,
  category: "work",
  subcategory: null,
  importance: "normal",
  urgency: "none",
  action_required: "no",
  system_tags: [],
  user_tags: [],
  routing_target: null,
  source: "human_confirmed",
  trust_score: 1,
  enabled: true,
};

export default function LearningPage() {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [entries, setEntries] = useState<MemoryWithMailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const accountList = await api.listAccounts();
      setAccounts(accountList);
      const memoryLists = await Promise.all(accountList.map(async (account) => {
        const memory = await api.listDecisionMemory(account.id, true);
        return memory.map((entry) => ({ ...entry, mailboxLabel: account.username }));
      }));
      setEntries(memoryLists.flat().sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("learning.unableLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => entries.filter((entry) => {
    const haystack = [entry.sender_email, entry.sender_domain, entry.subject_pattern, entry.category, entry.subcategory, entry.routing_target, entry.mailboxLabel].filter(Boolean).join(" ").toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    const matchesSource = source === "all" || entry.source === source;
    return matchesQuery && matchesSource;
  }), [entries, query, source]);

  const active = entries.filter((entry) => entry.enabled && !entry.superseded_by_id).length;
  const disabled = entries.filter((entry) => !entry.enabled).length;

  async function toggleEnabled(entry: MemoryWithMailbox) {
    setError(null);
    try {
      await api.updateDecisionMemory(entry.account_id, entry.id, toWrite(entry, !entry.enabled));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("learning.unableUpdate"));
    }
  }

  return (
    <main className={page.page}>
      <div className={page.headerRow}>
        <div className={page.titleBlock}>
          <h1 className={page.title}>{t("learning.title")}</h1>
          <p className={page.subtitle}>{t("learning.subtitle")}</p>
        </div>
        <button className="btn" type="button" onClick={() => setShowCreate(true)}>＋ {t("learning.newRule")}</button>
      </div>

      <div className={page.kpis}>
        <Kpi label={t("learning.activeRules")} value={String(active)} meta={t("learning.trustedMemory")} />
        <Kpi label={t("learning.disabled")} value={String(disabled)} meta={t("learning.notReused")} />
        <Kpi label={t("learning.reusedWeek")} value="—" meta={t("learning.needsMetric")} />
      </div>

      <div className={page.toolbar}>
        <input className={page.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("learning.filterPlaceholder")} />
        <select style={{ width: 190 }} value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="all">{t("learning.sourceAll")}</option>
          <option value="human_confirmed">{t("learning.humanConfirmed")}</option>
          <option value="human_corrected">{t("learning.humanCorrected")}</option>
          <option value="ai_observed">{t("learning.aiObserved")}</option>
        </select>
      </div>

      {error && <div className={page.error}>{error}</div>}
      {loading ? <div className={page.empty}>{t("learning.loading")}</div> : filtered.length === 0 ? <div className={page.empty}>{t("learning.noMatches")}</div> : (
        <div className={page.list}>
          {filtered.map((entry) => (
            <article key={entry.id} className={`${page.card} ${expanded === entry.id ? page.cardSelected : ""}`}>
              <button type="button" style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }} onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                <div className={page.cardHeader}>
                  <div className={page.cardTitleGroup}>
                    <SourceBadge source={entry.source} t={t} />
                    <span className={page.cardTitle}>{memoryTitle(entry, t)}</span>
                  </div>
                  <span className={trustClass(entry.trust_score)}>{trustLabel(entry.trust_score, t)}</span>
                </div>
                <div className={page.meta}>
                  <span>{Math.round(entry.trust_score * 100)}% {t("learning.trust")}</span><span className={page.metaSep} />
                  <span>{entry.hit_count} {t("learning.timesUsed")}</span><span className={page.metaSep} />
                  <span>{entry.mailboxLabel}</span><span className={page.metaSep} />
                  <span>{t("learning.updated")} {formatTime(entry.updated_at)}</span>
                </div>
              </button>
              {expanded === entry.id && (
                <div className={page.detail}>
                  <div><strong>{t("learning.match")}:</strong> {matchDescription(entry)}</div>
                  <div><strong>{t("learning.decision")}:</strong> {entry.category}{entry.subcategory ? ` / ${entry.subcategory}` : ""} · {entry.importance} · {entry.urgency} · {entry.action_required}</div>
                  {entry.routing_target && <div><strong>{t("learning.routing")}:</strong> {entry.routing_target}</div>}
                  <div className={page.actions}>
                    <button className="btn secondary" type="button" onClick={() => void toggleEnabled(entry)}>{entry.enabled ? t("learning.disableAutomation") : t("learning.enableAutomation")}</button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {showCreate && <CreateRuleModal accounts={accounts} t={t} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void load(); }} />}
    </main>
  );
}

function Kpi({ label, value, meta }: { label: string; value: string; meta: string }) {
  return <div className={page.kpi}><div className={page.kpiLabel}><span>{label}</span><span className={page.kpiDot} /></div><div className={page.kpiPrimary}><span className={page.kpiValue}>{value}</span><span className={page.kpiMeta}>{meta}</span></div></div>;
}

function SourceBadge({ source, t }: { source: DecisionMemoryEntry["source"]; t: Translator }) {
  const cls = source === "human_confirmed" ? page.success : source === "human_corrected" ? page.info : page.neutral;
  const text = source === "human_confirmed" ? t("learning.humanConfirmed") : source === "human_corrected" ? t("learning.humanCorrected") : t("learning.aiObserved");
  return <span className={`${page.badge} ${cls}`}>{text}</span>;
}

function CreateRuleModal({ accounts, t, onClose, onCreated }: { accounts: EmailAccount[]; t: Translator; onClose: () => void; onCreated: () => void }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [form, setForm] = useState<DecisionMemoryWrite>(emptyWrite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!accountId) throw new Error(t("learning.selectMailbox"));
      if (!form.sender_email && !form.sender_domain && !form.thread_id) throw new Error(t("learning.matcherRequired"));
      await createDecisionMemory(accountId, form);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("learning.unableCreate"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={page.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={page.modal} role="dialog" aria-modal="true" aria-labelledby="create-memory-title">
        <h2 id="create-memory-title">{t("learning.newRule")}</h2>
        <p>{t("learning.createSubtitle")}</p>
        <form className={page.modalForm} onSubmit={submit}>
          <label className="field">{t("processing.mailbox")}<select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>{accounts.map((account) => <option key={account.id} value={account.id}>{account.username}</option>)}</select></label>
          <label className="field">{t("learning.senderDomain")}<input value={form.sender_domain ?? ""} onChange={(e) => setForm({ ...form, sender_domain: e.target.value || null })} placeholder="example.com" /></label>
          <label className="field">{t("learning.senderEmail")}<input type="email" value={form.sender_email ?? ""} onChange={(e) => setForm({ ...form, sender_email: e.target.value || null })} placeholder="sender@example.com" /></label>
          <label className="field">{t("learning.category")}<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as DecisionMemoryWrite["category"] })}>{["work","private","finance","orders","appointments","newsletters","notifications","other"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="field">{t("learning.routingTarget")}<input value={form.routing_target ?? ""} onChange={(e) => setForm({ ...form, routing_target: e.target.value || null })} placeholder={t("learning.optionalFolder")} /></label>
          {error && <div className={page.error}>{error}</div>}
          <div className={page.modalActions}><button className="btn secondary" type="button" onClick={onClose}>{t("learning.cancel")}</button><button className="btn" type="submit" disabled={busy}>{busy ? t("learning.creating") : t("learning.confirm")}</button></div>
        </form>
      </section>
    </div>
  );
}

function toWrite(entry: DecisionMemoryEntry, enabled: boolean): DecisionMemoryWrite {
  return {
    sender_email: entry.sender_email, sender_domain: entry.sender_domain, subject_pattern: entry.subject_pattern, thread_id: entry.thread_id,
    category: entry.category, subcategory: entry.subcategory, importance: entry.importance, urgency: entry.urgency, action_required: entry.action_required,
    system_tags: entry.system_tags, user_tags: entry.user_tags, routing_target: entry.routing_target,
    source: entry.source === "ai_observed" ? "human_confirmed" : entry.source, trust_score: entry.trust_score, enabled,
  };
}

function memoryTitle(entry: DecisionMemoryEntry, t: Translator): string {
  if (entry.subject_pattern) return entry.subject_pattern;
  if (entry.sender_email) return `${t("learning.messagesFrom")} ${entry.sender_email}`;
  if (entry.sender_domain) return `${t("learning.messagesFrom")} ${entry.sender_domain}`;
  if (entry.thread_id) return `${t("learning.thread")} ${entry.thread_id}`;
  return `${entry.category} ${t("learning.decisionSuffix")}`;
}
function matchDescription(entry: DecisionMemoryEntry): string { return [entry.sender_email && `sender ${entry.sender_email}`, entry.sender_domain && `domain ${entry.sender_domain}`, entry.subject_pattern && `subject ${entry.subject_pattern}`, entry.thread_id && `thread ${entry.thread_id}`].filter(Boolean).join(" · "); }
function trustLabel(score: number, t: Translator): string { return score >= .9 ? t("learning.highTrust") : score >= .75 ? t("learning.mediumTrust") : t("learning.evaluating"); }
function trustClass(score: number): string { return score >= .9 ? page.trustHigh : score >= .75 ? page.trustMedium : page.trustLow; }
function formatTime(value: string): string { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
