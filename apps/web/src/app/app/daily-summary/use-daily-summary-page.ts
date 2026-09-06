"use client";

import { type DailySummary, attentionApi } from "@/lib/attention-api";
import { useCallback, useEffect, useMemo, useState } from "react";

export function useDailySummaryPage() {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSummary(await attentionApi.dailySummary());
    } catch (err) {
      setError(messageOf(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isEmpty = useMemo(() => {
    if (!summary) return false;
    return (
      summary.urgent.length === 0 &&
      summary.action_required.length === 0 &&
      summary.awaiting_review.length === 0 &&
      summary.important_new.length === 0 &&
      summary.failures.length === 0
    );
  }, [summary]);

  return { summary, error, isEmpty, reload: load };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "daily_summary_request_failed";
}
