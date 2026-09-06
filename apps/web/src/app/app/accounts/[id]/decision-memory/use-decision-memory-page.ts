"use client";

import { ApiError, api } from "@/lib/api";
import type { DecisionMemoryEntry, DecisionMemoryWrite } from "@/lib/types";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toDecisionWrite } from "./decision-memory-utils";

export function useDecisionMemoryPage() {
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
      setError(messageOf(err, "decision_memory_load_failed"));
      setEntries([]);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (entryId: string, payload: DecisionMemoryWrite) => {
      await runBusy(entryId, async () => {
        await api.updateDecisionMemory(accountId, entryId, payload);
        setEditing(null);
        setDraft(null);
        setNotice("updated");
        await load();
      });
    },
    [accountId, load],
  );

  const toggle = useCallback(
    (entry: DecisionMemoryEntry) =>
      save(entry.id, { ...toDecisionWrite(entry), enabled: !entry.enabled }),
    [save],
  );

  const remove = useCallback(
    async (entry: DecisionMemoryEntry) => {
      await runBusy(entry.id, async () => {
        await api.deleteDecisionMemory(accountId, entry.id);
        setNotice("deleted");
        await load();
      });
    },
    [accountId, load],
  );

  async function runBusy(id: string, action: () => Promise<void>) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(messageOf(err, "decision_memory_update_failed"));
    } finally {
      setBusy(null);
    }
  }

  function beginEdit(entry: DecisionMemoryEntry) {
    setEditing(entry.id);
    setDraft(toDecisionWrite(entry));
    setNotice(null);
    setError(null);
  }

  function cancelEdit() {
    setEditing(null);
    setDraft(null);
  }

  return {
    accountId,
    entries,
    editing,
    draft,
    busy,
    error,
    notice,
    reload: load,
    beginEdit,
    cancelEdit,
    setDraft,
    save,
    toggle,
    remove,
  };
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}
