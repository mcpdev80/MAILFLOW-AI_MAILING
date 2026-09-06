"use client";

import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ActionMode, EmailAccount } from "@/lib/types";
import { useEffect, useState } from "react";

type Props = {
  account: EmailAccount;
  canManage: boolean;
  onSaved: (account: EmailAccount) => void;
};

export function ActionPolicyCard({ account, canManage, onSaved }: Props) {
  const { t } = useI18n();
  const [movePolicy, setMovePolicy] = useState<ActionMode>(account.move_policy);
  const [archivePolicy, setArchivePolicy] = useState<ActionMode>(account.archive_policy);
  const [threshold, setThreshold] = useState(account.action_confidence_threshold);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setMovePolicy(account.move_policy);
    setArchivePolicy(account.archive_policy);
    setThreshold(account.action_confidence_threshold);
  }, [account]);

  if (!canManage) return null;

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.updateAccount(account.id, {
        move_policy: movePolicy,
        archive_policy: archivePolicy,
        action_confidence_threshold: threshold,
      });
      onSaved(updated);
      setNotice(t("account.actions.saved"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("account.actions.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <h2 style={{ marginTop: 0 }}>{t("account.actions.title")}</h2>
      <p className="muted">{t("account.actions.description")}</p>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}
      <PolicySelect id="move-policy" label={t("account.actions.move")} value={movePolicy} onChange={setMovePolicy} />
      <PolicySelect id="archive-policy" label={t("account.actions.archive")} value={archivePolicy} onChange={setArchivePolicy} />
      <ConfidenceField value={threshold} onChange={setThreshold} />
      <button className="btn secondary" type="button" disabled={busy || threshold < 0 || threshold > 1} onClick={() => void save()}>
        {busy ? t("account.actions.saving") : t("account.actions.save")}
      </button>
    </section>
  );
}

function PolicySelect({ id, label, value, onChange }: { id: string; label: string; value: ActionMode; onChange: (value: ActionMode) => void }) {
  const { t } = useI18n();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as ActionMode)}>
        <option value="automatic">{t("account.actions.automatic")}</option>
        <option value="review">{t("account.actions.review")}</option>
        <option value="off">{t("account.actions.off")}</option>
      </select>
    </label>
  );
}

function ConfidenceField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const { t } = useI18n();
  return (
    <label className="field" htmlFor="action-confidence">
      <span>{t("account.actions.confidence")}</span>
      <input id="action-confidence" type="number" min="0" max="1" step="0.01" value={value} onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(next);
      }} />
    </label>
  );
}
