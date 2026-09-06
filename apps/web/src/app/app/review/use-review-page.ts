"use client";

import {
  type OperationalReviewItem,
  type ReviewCorrection,
  type ReviewInbox,
  type ReviewItem,
  attentionApi,
} from "@/lib/attention-api";
import { useCallback, useEffect, useMemo, useState } from "react";

export function useReviewPage() {
  const [data, setData] = useState<ReviewInbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await attentionApi.review());
    } catch (err) {
      setError(messageOf(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = useCallback(
    async (item: ReviewItem, payload: ReviewCorrection) => {
      await runBusy(item.id, () => attentionApi.correctReview(item.id, payload));
    },
    [load],
  );

  const retry = useCallback(
    async (item: OperationalReviewItem) => {
      if (item.source_type !== "backfill_failure" || !item.job_id) return;
      await runBusy(item.id, () =>
        attentionApi.retryBackfillFailure(item.account_id, item.job_id!, item.id),
      );
    },
    [load],
  );

  async function runBusy(id: string, action: () => Promise<unknown>) {
    setBusy(id);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  const isEmpty = useMemo(
    () => data !== null && data.items.length === 0 && data.operational.length === 0,
    [data],
  );

  return { data, error, busy, isEmpty, reload: load, apply, retry };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "review_request_failed";
}
