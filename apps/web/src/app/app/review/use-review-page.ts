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

  const runBusy = useCallback(
    async (id: string, action: () => Promise<unknown>) => {
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
    },
    [load],
  );

  const apply = useCallback(
    (item: ReviewItem, payload: ReviewCorrection) =>
      runBusy(item.id, () => attentionApi.correctReview(item.id, payload)),
    [runBusy],
  );

  const retry = useCallback(
    (item: OperationalReviewItem) => {
      if (item.source_type !== "backfill_failure" || !item.job_id) {
        return Promise.resolve();
      }
      return runBusy(item.id, () =>
        attentionApi.retryBackfillFailure(item.account_id, item.job_id!, item.id),
      );
    },
    [runBusy],
  );

  const isEmpty = useMemo(
    () => data !== null && data.items.length === 0 && data.operational.length === 0,
    [data],
  );

  return { data, error, busy, isEmpty, reload: load, apply, retry };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "review_request_failed";
}
