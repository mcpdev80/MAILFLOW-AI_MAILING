import { ApiError } from "./api";
import { API_BASE } from "./config";

export type BulkReviewSample = {
  proposal_id: string;
  from_email: string;
  subject: string;
  confidence: number;
  reason: string | null;
};

export type BulkReviewCluster = {
  id: string;
  category: string;
  destination: string;
  action: "move" | "keep" | string;
  sender_domain: string | null;
  count: number;
  review_required: number;
  suspicious: number;
  safe: number;
  edited: number;
  confidence_avg: number;
  confidence_min: number;
  confidence_max: number;
  statuses: Record<string, number>;
  samples: BulkReviewSample[];
  children: BulkReviewCluster[];
};

export type BulkReviewSummary = {
  total: number;
  review_required: number;
  suspicious: number;
  safe: number;
  status_counts: Record<string, number>;
  decision_count: number;
  clusters: BulkReviewCluster[];
};

export type BulkProposalEdit = {
  category?: string;
  subcategory?: string;
  importance?: string;
  urgency?: string;
  action_required?: string;
  proposed_folder?: string;
  system_tags?: string[];
  user_tags?: string[];
  do_move?: boolean;
};

export type BulkApplyJob = {
  id: string;
  source_job_id: string;
  account_id: string;
  state: string;
  batch_size: number;
  approved: number;
  processed: number;
  applied: number;
  skipped: number;
  failed: number;
  review_required: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const detail =
      (body && (body.detail as string)) || response.statusText || "request failed";
    throw new ApiError(response.status, detail);
  }
  return body as T;
}

function base(accountId: string, jobId: string): string {
  return `/accounts/${encodeURIComponent(accountId)}/bulk/${encodeURIComponent(jobId)}`;
}

export const bulkReviewApi = {
  summary: (accountId: string, jobId: string) =>
    request<BulkReviewSummary>(`${base(accountId, jobId)}/review-summary`),
  approveSafe: (accountId: string, jobId: string) =>
    request<{ approved: number }>(`${base(accountId, jobId)}/approve-safe`, {
      method: "POST",
    }),
  approveCluster: (accountId: string, jobId: string, clusterId: string) =>
    request<{ approved: number; blocked_suspicious: number }>(
      `${base(accountId, jobId)}/clusters/${encodeURIComponent(clusterId)}/approve`,
      { method: "POST" },
    ),
  editCluster: (
    accountId: string,
    jobId: string,
    clusterId: string,
    payload: BulkProposalEdit,
  ) =>
    request<{ edited: number; skipped: number }>(
      `${base(accountId, jobId)}/clusters/${encodeURIComponent(clusterId)}`,
      { method: "PATCH", body: JSON.stringify(payload) },
    ),
  startApply: (accountId: string, jobId: string, batchSize = 50) =>
    request<{ job: BulkApplyJob; enqueued: boolean }>(
      `${base(accountId, jobId)}/apply`,
      { method: "POST", body: JSON.stringify({ batch_size: batchSize }) },
    ),
  applyStatus: (accountId: string, jobId: string) =>
    request<BulkApplyJob>(`${base(accountId, jobId)}/apply`),
};
