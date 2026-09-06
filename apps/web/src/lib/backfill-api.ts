import { API_BASE } from "./config";

export type BackfillMode = "dry_run" | "review" | "apply";
export type BackfillState = "running" | "paused" | "completed" | "cancelled" | "failed" | string;

export interface BackfillJob {
  id: string;
  account_id: string;
  folder: string;
  state: BackfillState;
  mode: BackfillMode;
  batch_size: number;
  uidvalidity: number | null;
  cursor_uid: number | null;
  total_discovered: number;
  processed: number;
  successful: number;
  review_required: number;
  failed: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  remaining: number;
}

export interface BackfillControl {
  job: BackfillJob;
  enqueued: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new Error((body?.detail as string | undefined) ?? response.statusText);
  return body as T;
}

export const backfillApi = {
  list: (accountId: string) => request<BackfillJob[]>(`/accounts/${accountId}/backfill`),
  start: (accountId: string, payload: { folder?: string; mode?: BackfillMode; batch_size?: number }) =>
    request<BackfillControl>(`/accounts/${accountId}/backfill`, { method: "POST", body: JSON.stringify(payload) }),
  pause: (accountId: string, jobId: string) =>
    request<BackfillControl>(`/accounts/${accountId}/backfill/${jobId}/pause`, { method: "POST" }),
  resume: (accountId: string, jobId: string) =>
    request<BackfillControl>(`/accounts/${accountId}/backfill/${jobId}/resume`, { method: "POST" }),
  cancel: (accountId: string, jobId: string) =>
    request<BackfillControl>(`/accounts/${accountId}/backfill/${jobId}/cancel`, { method: "POST" }),
};
