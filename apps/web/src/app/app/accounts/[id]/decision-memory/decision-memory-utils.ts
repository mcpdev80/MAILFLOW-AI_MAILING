import type { DecisionMemoryEntry, DecisionMemoryWrite } from "@/lib/types";

export const decisionCategories = [
  "work",
  "private",
  "finance",
  "orders",
  "appointments",
  "newsletters",
  "notifications",
  "other",
] as const;

export const importanceValues = [
  "critical",
  "high",
  "normal",
  "low",
  "unknown",
] as const;
export const urgencyValues = [
  "immediate",
  "today",
  "this_week",
  "none",
  "unknown",
] as const;
export const actionValues = ["yes", "no", "unknown"] as const;

export function toDecisionWrite(
  entry: DecisionMemoryEntry,
): DecisionMemoryWrite {
  return {
    sender_email: entry.sender_email,
    sender_domain: entry.sender_domain,
    subject_pattern: entry.subject_pattern,
    thread_id: entry.thread_id,
    category: entry.category,
    subcategory: entry.subcategory,
    importance: entry.importance,
    urgency: entry.urgency,
    action_required: entry.action_required,
    system_tags: entry.system_tags,
    user_tags: entry.user_tags,
    routing_target: entry.routing_target,
    source:
      entry.source === "human_corrected"
        ? "human_corrected"
        : "human_confirmed",
    trust_score: entry.trust_score,
    enabled: entry.enabled,
  };
}

export function decisionMatchLabel(entry: DecisionMemoryEntry): string {
  if (entry.thread_id) return `Thread ${entry.thread_id}`;
  const sender = entry.sender_email ?? entry.sender_domain;
  if (sender && entry.subject_pattern)
    return `${sender} · ${entry.subject_pattern}`;
  return sender ?? entry.subject_pattern ?? entry.id;
}
