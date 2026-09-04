"use client";

import { ApiError, api } from "@/lib/api";
import type {
  DecisionMemoryEntry,
  DecisionMemoryWrite,
} from "@/lib/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

function toWrite(entry: DecisionMemoryEntry): DecisionMemoryWrite {
  return {
    sender_email: entry.sender_email,
    sender_domain: entry.sender_domain,
    subject_pattern: entry.subject_pattern,
    thread_id: entry.thread_id,
    category: entry.category,
    subcategory: entry.subcategory,
    importance: entry.importance,
    urgency: entry.urgency,
    action_required: entry.action_required,
    system_tags: entry.system_tags,
    user_tags: entry.user_tags,
    routing_target: entry.routing_target,
    source:
      entry.source === "human_corrected" ? "human_corrected" : "human_confirmed",
    trust_score: entry.trust_score,
    enabled: entry.enabled,
  };
}

function matchLabel(entry: DecisionMemoryEntry): string {
  if (entry.thread_id) return `Thread ${entry.thread_id}`;
  if (entry.sender_email && entry.subject_pattern) {
    return `${entry.sender_email} · ${entry.subject_pattern}`;
  }
  if (entry.sender_email) return entry.sender_email;
  if (entry.sender_domain && entry.subject_pattern) {
    return `${entry.sender_domain} · ${entry.subject_pattern}`;
  }
  return entry.sender_domain ?? "Learned decision";
}

export default function DecisionMemoryPage() {
  const params = useParams<{ id: string }>();
  const accountId = params.id;
  const [entries, setEntries] = useState<DecisionMemoryEntry[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<DecisionMemoryWrite | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEntries(await api.listDecisionMemory(accountId, true));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load learned decisions");
      setEntries([]);
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  function beginEdit(entry: DecisionMemoryEntry) {
    setEditing(entry.id);
    setDraft(toWrite(entry));
    setNotice(null);
    setError(null);
  }

  async function save(entryId: string, payload: DecisionMemoryWrite) {
    setBusy(entryId);
    setError(null);
    setNotice(null);
    try {
      await api.updateDecisionMemory(accountId, entryId, payload);
      setEditing(null);
      setDraft(null);
      setNotice("Learned decision updated.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update learned decision");
    } finally {
      setBusy(null);
    }
  }

  async function toggle(entry: DecisionMemoryEntry) {
    await save(entry.id, { ...toWrite(entry), enabled: !entry.enabled });
  }

  async function remove(entry: DecisionMemoryEntry) {
    if (!confirm("Delete this learned decision?")) return;
    setBusy(entry.id);
    setError(null);
    setNotice(null);
    try {
      await api.deleteDecisionMemory(accountId, entry.id);
      setNotice("Learned decision deleted.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete learned decision");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="container">
      <p>
        <Link href={`/app/accounts/${accountId}`}>← Mailbox</Link>
      </p>

      <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: "0.25rem" }}>Learned decisions</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Human-confirmed classification decisions that MailFlow can safely reuse.
          </p>
        </div>
        <span className="pill">{entries?.length ?? 0} entries</span>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}
      {entries === null && <p className="muted">Loading…</p>}

      {entries !== null && entries.length === 0 && !error && (
        <div className="card empty">
          <h3>No learned decisions yet</h3>
          <p>Confirmed and corrected classifications will appear here.</p>
        </div>
      )}

      {entries?.map((entry) => {
        const isEditing = editing === entry.id && draft !== null;
        return (
          <section className="card" key={entry.id} style={{ opacity: entry.enabled ? 1 : 0.68 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "1rem", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0, overflowWrap: "anywhere" }}>{matchLabel(entry)}</h3>
                  <span className={`pill ${entry.enabled ? "ok" : "off"}`}>
                    {entry.enabled ? "active" : "disabled"}
                  </span>
                  {entry.superseded_by_id && <span className="pill off">superseded</span>}
                </div>
                <p className="muted" style={{ margin: "0.45rem 0 0" }}>
                  {entry.source.replaceAll("_", " ")} · trust {Math.round(entry.trust_score * 100)}% · used {entry.hit_count}×
                  {entry.last_used ? ` · last used ${new Date(entry.last_used).toLocaleString()}` : ""}
                </p>
              </div>
              {!isEditing && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button className="btn secondary" type="button" disabled={busy === entry.id} onClick={() => beginEdit(entry)}>
                    Edit
                  </button>
                  <button className="btn secondary" type="button" disabled={busy === entry.id} onClick={() => toggle(entry)}>
                    {entry.enabled ? "Disable" : "Enable"}
                  </button>
                  <button className="btn danger" type="button" disabled={busy === entry.id} onClick={() => remove(entry)}>
                    Delete
                  </button>
                </div>
              )}
            </div>

            {!isEditing && (
              <div className="row" style={{ marginTop: "1rem" }}>
                <div className="stat">
                  <div className="l">Classification</div>
                  <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>
                    {entry.category}{entry.subcategory ? ` / ${entry.subcategory}` : ""}
                  </div>
                </div>
                <div className="stat">
                  <div className="l">Priority</div>
                  <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>
                    {entry.importance} · {entry.urgency}
                  </div>
                </div>
                <div className="stat">
                  <div className="l">Action</div>
                  <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>
                    {entry.action_required === "yes" ? "required" : entry.action_required}
                  </div>
                </div>
                <div className="stat">
                  <div className="l">Route</div>
                  <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>
                    {entry.routing_target ?? "not fixed"}
                  </div>
                </div>
              </div>
            )}

            {isEditing && draft && (
              <div style={{ marginTop: "1.25rem" }}>
                <div className="row">
                  <div className="field">
                    <label htmlFor={`category-${entry.id}`}>Category</label>
                    <select id={`category-${entry.id}`} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as DecisionMemoryWrite["category"] })}>
                      {['work','private','finance','orders','appointments','newsletters','notifications','other'].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`subcategory-${entry.id}`}>Subcategory</label>
                    <input id={`subcategory-${entry.id}`} value={draft.subcategory ?? ""} onChange={(e) => setDraft({ ...draft, subcategory: e.target.value || null })} />
                  </div>
                </div>

                <div className="row">
                  <div className="field">
                    <label htmlFor={`importance-${entry.id}`}>Importance</label>
                    <select id={`importance-${entry.id}`} value={draft.importance} onChange={(e) => setDraft({ ...draft, importance: e.target.value as DecisionMemoryWrite["importance"] })}>
                      {['critical','high','normal','low','unknown'].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`urgency-${entry.id}`}>Urgency</label>
                    <select id={`urgency-${entry.id}`} value={draft.urgency} onChange={(e) => setDraft({ ...draft, urgency: e.target.value as DecisionMemoryWrite["urgency"] })}>
                      {['immediate','today','this_week','none','unknown'].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`action-${entry.id}`}>Action required</label>
                    <select id={`action-${entry.id}`} value={draft.action_required} onChange={(e) => setDraft({ ...draft, action_required: e.target.value as DecisionMemoryWrite["action_required"] })}>
                      {['yes','no','unknown'].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </div>
                </div>

                <div className="row">
                  <div className="field">
                    <label htmlFor={`subject-${entry.id}`}>Subject pattern</label>
                    <input id={`subject-${entry.id}`} value={draft.subject_pattern ?? ""} onChange={(e) => setDraft({ ...draft, subject_pattern: e.target.value || null })} />
                  </div>
                  <div className="field">
                    <label htmlFor={`route-${entry.id}`}>Routing target</label>
                    <input id={`route-${entry.id}`} value={draft.routing_target ?? ""} onChange={(e) => setDraft({ ...draft, routing_target: e.target.value || null })} />
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button className="btn" type="button" disabled={busy === entry.id} onClick={() => save(entry.id, { ...draft, source: "human_corrected" })}>
                    {busy === entry.id ? "Saving…" : "Save correction"}
                  </button>
                  <button className="btn secondary" type="button" disabled={busy === entry.id} onClick={() => { setEditing(null); setDraft(null); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
