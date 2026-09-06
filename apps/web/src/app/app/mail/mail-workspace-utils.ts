import type { InboxMessage } from "@/lib/types";

export function displayMailDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { day: "2-digit", month: "short" });
}

export function formatAttachmentBytes(value: number | null): string {
  if (value == null) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function messageKey(
  message: Pick<InboxMessage, "account_id" | "folder" | "uid">,
): string {
  return `${message.account_id}:${message.folder}:${message.uid}`;
}

export function safeRecipients(values: string[], ownAddress: string): string[] {
  const own = ownAddress.trim().toLowerCase();
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    for (const item of raw.split(",")) {
      const value = item.trim();
      const normalized = value.toLowerCase();
      if (!value || normalized === own || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(value);
    }
  }
  return result;
}

export function prefixedSubject(subject: string, prefix: "Re:" | "Fwd:"): string {
  const cleaned = subject.trim();
  if (prefix === "Re:" && /^re:/i.test(cleaned)) return cleaned;
  if (prefix === "Fwd:" && /^(fwd?|wg):/i.test(cleaned)) return cleaned;
  return `${prefix} ${cleaned}`.trim();
}

export function senderInitials(sender: string): string {
  const local = sender.split("@")[0] ?? sender;
  return local
    .split(/[._\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
