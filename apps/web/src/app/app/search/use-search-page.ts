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

export function emptySearchFilters(): SearchFilters {
  return {
    q: "",
    sender: "",
    subject: "",
    account_id: "",
    category: "",
    subcategory: "",
    importance: "",
    urgency: "",
    action_required: "",
    review_required: "",
    suspicious_content: "",
    tag: "",
    destination_folder: "",
    classification_source: "",
    processed_state: "",
    date_from: "",
    date_to: "",
  };
}

function createInitialFilters(params: URLSearchParams): SearchFilters {
  const filters = emptySearchFilters();
  for (const key of Object.keys(filters) as Array<keyof SearchFilters>) {
    filters[key] = initialValue(params, key);
  }
  return filters;
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

  const reset = useCallback(() => {
    const next = emptySearchFilters();
    setFilters(next);
    void runSearch(next);
  }, [runSearch]);

  return {
    filters,
    accounts,
    result,
    error,
    loading,
    setFilter,
    runSearch,
    reset,
  };
}
