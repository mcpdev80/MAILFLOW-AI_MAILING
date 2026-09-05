"use client";

import { api } from "@/lib/api";
import { type MessageSearchResult, dashboardApi } from "@/lib/dashboard-api";
import type { EmailAccount } from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SearchFilters } from "./search-ui";

function initialValue(params: URLSearchParams, key: string): string {
  return params.get(key) ?? "";
}

function createInitialFilters(params: URLSearchParams): SearchFilters {
  return {
    q: initialValue(params, "q"),
    sender: initialValue(params, "sender"),
    account_id: initialValue(params, "account_id"),
    category: initialValue(params, "category"),
    subcategory: initialValue(params, "subcategory"),
    importance: initialValue(params, "importance"),
    urgency: initialValue(params, "urgency"),
    action_required: initialValue(params, "action_required"),
    review_required: initialValue(params, "review_required"),
    suspicious_content: initialValue(params, "suspicious_content"),
    tag: initialValue(params, "tag"),
    destination_folder: initialValue(params, "destination_folder"),
    classification_source: initialValue(params, "classification_source"),
    processed_state: initialValue(params, "processed_state"),
    date_from: initialValue(params, "date_from"),
    date_to: initialValue(params, "date_to"),
  };
}

function toParams(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  params.set("limit", "100");
  return params;
}

export function useSearchPage() {
  const searchParams = useSearchParams();
  const initial = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams],
  );
  const [filters, setFilters] = useState(() => createInitialFilters(initial));
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [result, setResult] = useState<MessageSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const firstRun = useRef(false);

  const runSearch = useCallback(async (next: SearchFilters) => {
    setLoading(true);
    setError(null);
    try {
      const params = toParams(next);
      setResult(await dashboardApi.search(params));
      window.history.replaceState(null, "", `/app/search?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "search_failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    if (firstRun.current) return;
    firstRun.current = true;
    void runSearch(filters);
  }, [filters, runSearch]);

  const setFilter = useCallback((key: keyof SearchFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  }, []);

  return { filters, accounts, result, error, loading, setFilter, runSearch };
}
