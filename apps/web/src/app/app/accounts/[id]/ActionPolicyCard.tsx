"use client";

import { ApiError, api } from "@/lib/api";
import type { ActionMode, EmailAccount } from "@/lib/types";
import { useEffect, useState } from "react";

type Props = {
  account: EmailAccount;
  canManage: boolean;
  onSaved: (account: EmailAccount) => void;
};

export function ActionPolicyCard({ account, canManage, onSaved }: Props) {
  const [movePolicy, setMovePolicy] = useState<ActionMode>(account.move_policy);
  const [archivePolicy, setArchivePolicy] = useState<ActionMode>(
    account.archive_policy,
  );
  const [threshold, setThreshold] = useState(
    account.action_confidence_threshold,
  );
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
      setNotice("Mailbox action policy updated.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not update action policy",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: "1.25rem" }}>
      <h3>Mailbox actions</h3>
      <p className="muted">
        Classification is automatic. Moves and archives are applied only after
        the mailbox safety policy allows them. Delete and send always require an
        explicit user action.
      </p>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <div className="field">
        <label htmlFor="move-policy">Move classified mail</label>
        <select
          id="move-policy"
          value={movePolicy}
          onChange={(event) => setMovePolicy(event.target.value as ActionMode)}
        >
          <option value="automatic">Automatic when safe</option>
          <option value="review">Always review first</option>
          <option value="off">Off</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="archive-policy">Archive actions</label>
        <select
          id="archive-policy"
          value={archivePolicy}
          onChange={(event) =>
            setArchivePolicy(event.target.value as ActionMode)
          }
        >
          <option value="off">Off</option>
          <option value="review">Always review first</option>
          <option value="automatic">Automatic when safe</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="action-confidence">
          Minimum confidence for automatic actions
        </label>
        <input
          id="action-confidence"
          type="number"
          min="0"
          max="1"
          step="0.01"
          value={threshold}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value)) setThreshold(value);
          }}
        />
      </div>

      <button
        type="button"
        className="btn secondary"
        disabled={busy || threshold < 0 || threshold > 1}
        onClick={save}
      >
        {busy ? "Saving…" : "Save action policy"}
      </button>
    </div>
  );
}
