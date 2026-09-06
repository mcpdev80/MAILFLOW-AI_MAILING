"use client";

import { ApiError, api } from "@/lib/api";
import { type ReviewInbox, attentionApi } from "@/lib/attention-api";
import { type DashboardOverview, dashboardApi } from "@/lib/dashboard-api";
import { useCallback, useEffect, useState } from "react";

export function useDashboard() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [review, setReview] = useState<ReviewInbox | null>(null);
  const [rangeDays, setRangeDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<"queued" | "failed" | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const load = useCallback(async (days: number) => {
    setError(null);
    const [overviewResult, reviewResult] = await Promise.allSettled([
      dashboardApi.overview(days),
      attentionApi.review(),
    ]);
    if (overviewResult.status === "fulfilled")
      setOverview(overviewResult.value);
    else {
      const err = overviewResult.reason;
      setError(err instanceof ApiError ? err.message : String(err));
      setOverview(null);
    }
    if (reviewResult.status === "fulfilled") setReview(reviewResult.value);
  }, []);

  useEffect(() => {
    void load(rangeDays);
  }, [load, rangeDays]);

  const runNow = useCallback(
    async (accountId: string) => {
      setRunningId(accountId);
      setNotice(null);
      try {
        const response = await api.runCycle(accountId);
        setNotice(response.enqueued ? "queued" : "failed");
        if (response.enqueued) await load(rangeDays);
      } catch {
        setNotice("failed");
      } finally {
        setRunningId(null);
      }
    },
    [load, rangeDays],
  );

  return {
    overview,
    review,
    rangeDays,
    setRangeDays,
    error,
    notice,
    runningId,
    runNow,
  };
}
