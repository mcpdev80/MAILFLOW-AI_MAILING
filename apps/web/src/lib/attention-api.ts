import { API_BASE } from "./config";

export interface AttentionCounters {
  urgent: number;
  action_required: number;
  review_needed: number;
  failures: number;
  security: number;
  unread_notifications: number;
}

export interface ReviewItem {
  id: string;
  account_id: string;
  account_label: string;
  ownership_mode: string;
  uid: number;
  folder: string;
  thread_id: string | null;
  subject: string;
  from_email: string;
  category: string;
  subcategory: string | null;
  importance: string;
  urgency: string;
  action_required: string;
  confidence: number;
  reason: string;
  review_type: string;
  priority: number;
  destination_folder: string;
  system_tags: string[];
  user_tags: string[];
  suspicious_content: boolean;
  action_review_required: boolean;
  processed_at: string;
}

export interface ReviewInbox {
  items: ReviewItem[];
  counters: AttentionCounters;
}

export interface ReviewCorrection {
  category?: string | null;
  subcategory?: string | null;
  importance?: string | null;
  urgency?: string | null;
  action_required?: string | null;
  destination_folder?: string | null;
  system_tags?: string[] | null;
  user_tags?: string[] | null;
  routing_decision?: "approve" | "reject" | null;
  dismiss?: boolean;
  remember?: boolean;
}

export interface NotificationPreference {
  urgent_enabled: boolean;
  security_review_enabled: boolean;
  jobs_enabled: boolean;
  mailbox_health_enabled: boolean;
  daily_summary_enabled: boolean;
  daily_summary_hour: number;
  timezone: string;
}

export interface NotificationItem {
  id: string;
  account_id: string | null;
  event_type: string;
  severity: string;
  title: string;
  body: string;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface NotificationCenter {
  notifications: NotificationItem[];
  unread: number;
  counters: AttentionCounters;
}

export interface DailySummaryItem {
  account_id: string;
  account_label: string;
  message_id: string;
  subject: string;
  from_email: string;
  category: string;
  importance: string;
  urgency: string;
  action_required: string;
  reason: string | null;
}

export interface DailySummary {
  generated_at: string;
  since: string;
  counters: AttentionCounters;
  urgent: DailySummaryItem[];
  action_required: DailySummaryItem[];
  awaiting_review: DailySummaryItem[];
  important_new: DailySummaryItem[];
  failures: DailySummaryItem[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new Error((body?.detail as string | undefined) ?? res.statusText);
  }
  return body as T;
}

export const attentionApi = {
  review: () => request<ReviewInbox>("/attention/review"),
  correctReview: (id: string, payload: ReviewCorrection) =>
    request<ReviewItem | undefined>(`/attention/review/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  notifications: (includeResolved = false) =>
    request<NotificationCenter>(
      `/attention/notifications?include_resolved=${includeResolved}`,
    ),
  markRead: (id: string) =>
    request<void>(`/attention/notifications/${id}/read`, { method: "POST" }),
  preferences: () => request<NotificationPreference>("/attention/preferences"),
  savePreferences: (payload: NotificationPreference) =>
    request<NotificationPreference>("/attention/preferences", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  dailySummary: (hours = 24) =>
    request<DailySummary>(`/attention/daily-summary?hours=${hours}`),
};
