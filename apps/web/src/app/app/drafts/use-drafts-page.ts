"use client";

import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { MailDraft } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

export function useDraftsPage() {
  const { t } = useI18n();
  const [drafts, setDrafts] = useState<MailDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDrafts(await api.listDrafts());
    } catch (err) {
      setError(messageOf(err, t("drafts.loadFailed")));
      setDrafts([]);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const discard = useCallback(
    async (id: string) => {
      if (!window.confirm(t("drafts.discardConfirm"))) return;
      try {
        await api.discardDraft(id);
        await load();
      } catch (err) {
        setError(messageOf(err, t("drafts.discardFailed")));
      }
    },
    [load, t],
  );

  return { drafts, error, reload: load, discard };
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}
