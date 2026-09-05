import { ApiError } from "./api";
import { API_BASE } from "./config";

export type DashboardCounters = {
  total_processed: number;
  processed_range: number;
  processed_today: number;
  pending_or_queued: number;
  review_required: number;
  urgent: number;
  action_required: number;
  failed_or_deferred: number;
  automated_actions: number;
  decision_memory: number;
  fast_model: number;
  deep_model: number;
  active_backfills: number;
};

export type DashboardTrendPoint = {
  day: string;
  processed: number;
  review: number;
  failures: number;
};

export type DashboardBreakdownItem = { key: string; count: number };

export type DashboardMailboxStatus = {
  account_id: string;
  label: string;
  ownership_mode: string;
  is_active: boolean;
  last_cycle_at: string | null;
  processed_today: number;
  review_count: number;
  pending_count: number;
  health: string;
  last_error: string | null;
  backfill_status: string | null;
  backfill_processed: number | null;
  backfill_total: number | null;
};

export type DashboardOverview = {
  range_days: number;
  generated_at: string;
  counters: DashboardCounters;
  trend: DashboardTrendPoint[];
  categories: DashboardBreakdownItem[];
  handling: DashboardBreakdownItem[];
  mailboxes: DashboardMailboxStatus[];
  inference_status: string;
  inference_warning: string | null;
};

export type MessageSearchItem = {
  id: string;
  account_id: string;
  account_label: string;
  ownership_mode: string;
  uid: number;
  folder: string;
  from_email: string;
  subject: string;
  processed_at: string;
  category: string;
  subcategory: string | null;
  importance: string;
  urgency: string;
  action_required: string;
  review_required: boolean;
  suspicious_content: boolean;
  system_tags: string[];
  user_tags: string[];
  destination_folder: string;
  classification_source: string;
  processed_state: string;
};

export type MessageSearchResult = {
  total: number;
  limit: number;
  offset: number;
  items: MessageSearchItem[];
};

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const detail =
      (body && (body.detail as string)) ||
      response.statusText ||
      "request failed";
    throw new ApiError(response.status, detail);
  }
  return body as T;
}

export const dashboardApi = {
  overview: (rangeDays = 7) =>
    request<DashboardOverview>(`/dashboard/overview?range_days=${rangeDays}`),
  search: (params: URLSearchParams) =>
    request<MessageSearchResult>(`/dashboard/search?${params.toString()}`),
};
