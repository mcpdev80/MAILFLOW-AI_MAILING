"use client";

import { api } from "@/lib/api";
import { createDecisionMemory } from "@/lib/decision-memory-api";
import type { DecisionMemoryEntry, DecisionMemoryWrite, EmailAccount } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import page from "@/components/figma-page.module.css";

interface MemoryWithMailbox extends DecisionMemoryEntry {
  mailboxLabel: string;
}

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
      setError(err instanceof Error ? err.message : "Unable to load Decision Memory");
    } finally {
      setLoading(false);
    }
  }, []);

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
      setError(err instanceof Error ? err.message : "Unable to update rule");
    }
  }

  return (
    <main className={page.page}>
      <div className={page.headerRow}>
        <div className={page.titleBlock}>
          <h1 className={page.title}>Decision Memory</h1>
          <p className={page.subtitle}>Inspect and optimize automated classification learning and human interventions</p>
        </div>
        <button className="btn" type="button" onClick={() => setShowCreate(true)}>＋ New Learning Rule</button>
      </div>

      <div className={page.kpis}>
        <Kpi label="Active Rules" value={String(active)} meta="Trusted memory" />
        <Kpi label="Disabled" value={String(disabled)} meta="Not reused" />
        <Kpi label="Reused This Week" value="—" meta="Needs time-window metric" />
      </div>

      <div className={page.toolbar}>
        <input className={page.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter memory rules…" />
        <select style={{ width: 170 }} value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="all">Source: All</option>
          <option value="human_confirmed">Human Confirmed</option>
          <option value="human_corrected">Human Corrected</option>
          <option value="ai_observed">AI Observed</option>
        </select>
      </div>

      {error && <div className={page.error}>{error}</div>}
      {loading ? <div className={page.empty}>Loading Decision Memory…</div> : filtered.length === 0 ? <div className={page.empty}>No matching Decision Memory entries.</div> : (
        <div className={page.list}>
          {filtered.map((entry) => (
            <article key={entry.id} className={`${page.card} ${expanded === entry.id ? page.cardSelected : ""}`}>
              <button type="button" style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }} onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                <div className={page.cardHeader}>
                  <div className={page.cardTitleGroup}>
                    <SourceBadge source={entry.source} />
                    <span className={page.cardTitle}>{memoryTitle(entry)}</span>
                  </div>
                  <span className={trustClass(entry.trust_score)}>{trustLabel(entry.trust_score)}</span>
                </div>
                <div className={page.meta}>
                  <span>{Math.round(entry.trust_score * 100)}% trust</span><span className={page.metaSep} />
                  <span>{entry.hit_count} times used</span><span className={page.metaSep} />
                  <span>{entry.mailboxLabel}</span><span className={page.metaSep} />
                  <span>Updated {formatTime(entry.updated_at)}</span>
                </div>
              </button>
              {expanded === entry.id && (
                <div className={page.detail}>
                  <div><strong>Match:</strong> {matchDescription(entry)}</div>
                  <div><strong>Decision:</strong> {entry.category}{entry.subcategory ? ` / ${entry.subcategory}` : ""} · {entry.importance} · {entry.urgency} · action {entry.action_required}</div>
                  {entry.routing_target && <div><strong>Routing:</strong> {entry.routing_target}</div>}
                  <div className={page.actions}>
                    <button className="btn secondary" type="button" onClick={() => void toggleEnabled(entry)}>{entry.enabled ? "Disable Automation" : "Enable Automation"}</button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {showCreate && <CreateRuleModal accounts={accounts} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void load(); }} />}
    </main>
  );
}

function Kpi({ label, value, meta }: { label: string; value: string; meta: string }) {
  return <div className={page.kpi}><div className={page.kpiLabel}><span>{label}</span><span className={page.kpiDot} /></div><div className={page.kpiPrimary}><span className={page.kpiValue}>{value}</span><span className={page.kpiMeta}>{meta}</span></div></div>;
}

function SourceBadge({ source }: { source: DecisionMemoryEntry["source"] }) {
  const cls = source === "human_confirmed" ? page.success : source === "human_corrected" ? page.info : page.neutral;
  const text = source === "human_confirmed" ? "Human Confirmed" : source === "human_corrected" ? "Human Corrected" : "AI Observed";
  return <span className={`${page.badge} ${cls}`}>{text}</span>;
}

function CreateRuleModal({ accounts, onClose, onCreated }: { accounts: EmailAccount[]; onClose: () => void; onCreated: () => void }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [form, setForm] = useState<DecisionMemoryWrite>(emptyWrite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!accountId) throw new Error("Select a mailbox.");
      if (!form.sender_email && !form.sender_domain && !form.thread_id) throw new Error("Sender email, sender domain or thread ID is required.");
      await createDecisionMemory(accountId, form);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create rule");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={page.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={page.modal} role="dialog" aria-modal="true" aria-labelledby="create-memory-title">
        <h2 id="create-memory-title">New Learning Rule</h2>
        <p>Create a trusted mailbox-scoped Decision Memory rule.</p>
        <form className={page.modalForm} onSubmit={submit}>
          <label className="field">Mailbox<select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>{accounts.map((account) => <option key={account.id} value={account.id}>{account.username}</option>)}</select></label>
          <label className="field">Sender domain<input value={form.sender_domain ?? ""} onChange={(e) => setForm({ ...form, sender_domain: e.target.value || null })} placeholder="example.com" /></label>
          <label className="field">Sender email<input type="email" value={form.sender_email ?? ""} onChange={(e) => setForm({ ...form, sender_email: e.target.value || null })} placeholder="sender@example.com" /></label>
          <label className="field">Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as DecisionMemoryWrite["category"] })}>{["work","private","finance","orders","appointments","newsletters","notifications","other"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="field">Routing target<input value={form.routing_target ?? ""} onChange={(e) => setForm({ ...form, routing_target: e.target.value || null })} placeholder="Optional folder" /></label>
          {error && <div className={page.error}>{error}</div>}
          <div className={page.modalActions}><button className="btn secondary" type="button" onClick={onClose}>Cancel</button><button className="btn" type="submit" disabled={busy}>{busy ? "Creating…" : "Confirm"}</button></div>
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

function memoryTitle(entry: DecisionMemoryEntry): string {
  if (entry.subject_pattern) return entry.subject_pattern;
  if (entry.sender_email) return `Messages from ${entry.sender_email}`;
  if (entry.sender_domain) return `Messages from ${entry.sender_domain}`;
  if (entry.thread_id) return `Thread ${entry.thread_id}`;
  return `${entry.category} decision`;
}
function matchDescription(entry: DecisionMemoryEntry): string { return [entry.sender_email && `sender ${entry.sender_email}`, entry.sender_domain && `domain ${entry.sender_domain}`, entry.subject_pattern && `subject ${entry.subject_pattern}`, entry.thread_id && `thread ${entry.thread_id}`].filter(Boolean).join(" · "); }
function trustLabel(score: number): string { return score >= .9 ? "High Trust" : score >= .75 ? "Medium Trust" : "Evaluating"; }
function trustClass(score: number): string { return score >= .9 ? page.trustHigh : score >= .75 ? page.trustMedium : page.trustLow; }
function formatTime(value: string): string { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
