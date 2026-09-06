"use client";

import { enumLabel, useI18n } from "@/lib/i18n";
import type { DecisionMemoryEntry, DecisionMemoryWrite } from "@/lib/types";
import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";
import {
  actionValues,
  decisionCategories,
  decisionMatchLabel,
  importanceValues,
  urgencyValues,
} from "./decision-memory-utils";

type DecisionMemoryUiProps = {
  accountId: string;
  entries: DecisionMemoryEntry[] | null;
  editing: string | null;
  draft: DecisionMemoryWrite | null;
  busy: string | null;
  error: string | null;
  notice: string | null;
  setDraft: Dispatch<SetStateAction<DecisionMemoryWrite | null>>;
  onBeginEdit: (entry: DecisionMemoryEntry) => void;
  onCancelEdit: () => void;
  onSave: (entryId: string, payload: DecisionMemoryWrite) => Promise<void>;
  onToggle: (entry: DecisionMemoryEntry) => Promise<void>;
  onRemove: (entry: DecisionMemoryEntry) => Promise<void>;
  onReload: () => Promise<void>;
};

export function DecisionMemoryUi(props: DecisionMemoryUiProps) {
  const { t } = useI18n();
  return (
    <main className="container" style={{ maxWidth: 1440, margin: "0 auto" }}>
      <Header accountId={props.accountId} count={props.entries?.length ?? 0} />
      {props.error && <ErrorBanner error={props.error} onReload={props.onReload} />}
      {props.notice && <div className="alert ok">{props.notice === "deleted" ? t("decision.deleted") : t("decision.updated")}</div>}
      {props.entries === null && !props.error && <div className="card muted">{t("common.loading")}</div>}
      {props.entries?.length === 0 && !props.error && <EmptyState />}
      <div style={{ display: "grid", gap: 12 }}>
        {props.entries?.map((entry) => <DecisionCard key={entry.id} entry={entry} {...props} />)}
      </div>
    </main>
  );
}

function Header({ accountId, count }: { accountId: string; count: number }) {
  const { t } = useI18n();
  return (
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
      <div>
        <Link href={`/app/accounts/${accountId}`}>← {t("dashboard.mailbox")}</Link>
        <h1 style={{ marginBottom: 4 }}>{t("decision.title")}</h1>
        <p className="muted" style={{ margin: 0 }}>{t("decision.description")}</p>
      </div>
      <span className="pill">{count} {t("decision.entries")}</span>
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

function EmptyState() {
  const { t } = useI18n();
  return (
    <div className="card empty">
      <h3>{t("decision.emptyTitle")}</h3>
      <p>{t("decision.emptyBody")}</p>
    </div>
  );
}

function DecisionCard(props: DecisionMemoryUiProps & { entry: DecisionMemoryEntry }) {
  const isEditing = props.editing === props.entry.id && props.draft !== null;
  return (
    <article className="card" style={{ opacity: props.entry.enabled ? 1 : 0.68 }}>
      <DecisionCardHeader {...props} isEditing={isEditing} />
      {isEditing && props.draft ? <DecisionEditor {...props} draft={props.draft} /> : <DecisionSummary entry={props.entry} />}
    </article>
  );
}

function DecisionCardHeader(props: DecisionMemoryUiProps & { entry: DecisionMemoryEntry; isEditing: boolean }) {
  const { t, locale } = useI18n();
  const entry = props.entry;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <h3 style={{ margin: 0, overflowWrap: "anywhere" }}>{decisionMatchLabel(entry)}</h3>
          <span className={`pill ${entry.enabled ? "ok" : "off"}`}>{entry.enabled ? t("decision.enabled") : t("decision.disabled")}</span>
          {entry.superseded_by_id && <span className="pill off">{t("decision.superseded")}</span>}
        </div>
        <div className="muted" style={{ marginTop: 6 }}>
          {t("decision.source")}: {entry.source.replaceAll("_", " ")} · {t("decision.trust")}: {Math.round(entry.trust_score * 100)}% · {t("decision.used")}: {entry.hit_count}×
          {entry.last_used ? ` · ${t("decision.lastUsed")}: ${new Date(entry.last_used).toLocaleString(locale)}` : ""}
        </div>
      </div>
      {!props.isEditing && <DecisionActions {...props} />}
    </div>
  );
}

function DecisionActions(props: DecisionMemoryUiProps & { entry: DecisionMemoryEntry }) {
  const { t } = useI18n();
  const busy = props.busy === props.entry.id;
  async function remove() {
    if (window.confirm(t("decision.deleteConfirm"))) await props.onRemove(props.entry);
  }
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="btn secondary" type="button" disabled={busy} onClick={() => props.onBeginEdit(props.entry)}>{t("common.edit")}</button>
      <button className="btn secondary" type="button" disabled={busy} onClick={() => void props.onToggle(props.entry)}>{props.entry.enabled ? t("common.disable") : t("common.enable")}</button>
      <button className="btn danger" type="button" disabled={busy} onClick={() => void remove()}>{t("common.delete")}</button>
    </div>
  );
}

function DecisionSummary({ entry }: { entry: DecisionMemoryEntry }) {
  const { t } = useI18n();
  const values = [
    [t("decision.classification"), `${enumLabel(t, "category", entry.category)}${entry.subcategory ? ` / ${entry.subcategory}` : ""}`],
    [t("decision.priority"), `${enumLabel(t, "importance", entry.importance)} · ${enumLabel(t, "urgency", entry.urgency)}`],
    [t("decision.action"), enumLabel(t, "action_required", entry.action_required)],
    [t("decision.route"), entry.routing_target ?? t("decision.notFixed")],
  ];
  return (
    <div className="row" style={{ marginTop: 16 }}>
      {values.map(([label, value]) => <div className="stat" key={label}><div className="l">{label}</div><div style={{ marginTop: 4, fontWeight: 600 }}>{value}</div></div>)}
    </div>
  );
}

function DecisionEditor(props: DecisionMemoryUiProps & { entry: DecisionMemoryEntry; draft: DecisionMemoryWrite }) {
  const { t } = useI18n();
  const patch = (value: Partial<DecisionMemoryWrite>) => props.setDraft({ ...props.draft, ...value });
  return (
    <div style={{ marginTop: 18 }}>
      <div className="row">
        <SelectField label={t("review.category")} value={props.draft.category} options={decisionCategories} labelFor={(v) => enumLabel(t, "category", v)} onChange={(category) => patch({ category: category as DecisionMemoryWrite["category"] })} />
        <TextField label={t("decision.subcategory")} value={props.draft.subcategory ?? ""} onChange={(subcategory) => patch({ subcategory: subcategory || null })} />
      </div>
      <div className="row">
        <SelectField label={t("decision.importance")} value={props.draft.importance} options={importanceValues} labelFor={(v) => enumLabel(t, "importance", v)} onChange={(importance) => patch({ importance: importance as DecisionMemoryWrite["importance"] })} />
        <SelectField label={t("decision.urgency")} value={props.draft.urgency} options={urgencyValues} labelFor={(v) => enumLabel(t, "urgency", v)} onChange={(urgency) => patch({ urgency: urgency as DecisionMemoryWrite["urgency"] })} />
        <SelectField label={t("decision.actionRequired")} value={props.draft.action_required} options={actionValues} labelFor={(v) => enumLabel(t, "action_required", v)} onChange={(action_required) => patch({ action_required: action_required as DecisionMemoryWrite["action_required"] })} />
      </div>
      <div className="row">
        <TextField label={t("decision.subjectPattern")} value={props.draft.subject_pattern ?? ""} onChange={(subject_pattern) => patch({ subject_pattern: subject_pattern || null })} />
        <TextField label={t("decision.routingTarget")} value={props.draft.routing_target ?? ""} onChange={(routing_target) => patch({ routing_target: routing_target || null })} />
      </div>
      <EditorActions {...props} />
    </div>
  );
}

function EditorActions(props: DecisionMemoryUiProps & { entry: DecisionMemoryEntry; draft: DecisionMemoryWrite }) {
  const { t } = useI18n();
  const busy = props.busy === props.entry.id;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="btn" type="button" disabled={busy} onClick={() => void props.onSave(props.entry.id, { ...props.draft, source: "human_corrected" })}>{t("decision.saveCorrection")}</button>
      <button className="btn secondary" type="button" disabled={busy} onClick={props.onCancelEdit}>{t("common.cancel")}</button>
    </div>
  );
}

function SelectField({ label, value, options, labelFor, onChange }: { label: string; value: string; options: readonly string[]; labelFor: (value: string) => string; onChange: (value: string) => void }) {
  return <label className="field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{labelFor(option)}</option>)}</select></label>;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field"><span>{label}</span><input value={value} maxLength={255} onChange={(event) => onChange(event.target.value)} /></label>;
}
