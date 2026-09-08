import { API_BASE } from "@/lib/config";
import type { UnifiedInbox } from "@/lib/types";

export type RichHtmlResult = {
  available: boolean;
  trusted: boolean;
  blocked: boolean;
  blocked_reason: "spam" | "phishing" | null;
  sender_email: string;
  html: string | null;
};

type PreferencesWithRemoteContent = {
  remote_content_senders?: string[];
};

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail || response.statusText || "request_failed");
  }
  return response.json() as Promise<T>;
}

export function loadUnifiedFolder(role: string, limit = 60): Promise<UnifiedInbox> {
  const params = new URLSearchParams({ folder_role: role, limit: String(limit) });
  return jsonRequest<UnifiedInbox>(`/mail-client/inbox?${params.toString()}`);
}

export function loadRichHtml(
  accountId: string,
  folder: string,
  uid: number,
  force = false,
): Promise<RichHtmlResult> {
  const params = new URLSearchParams({ folder, force: String(force) });
  return jsonRequest<RichHtmlResult>(
    `/mail-client/accounts/${encodeURIComponent(accountId)}/messages/${uid}/rich-html?${params.toString()}`,
  );
}

export async function trustedRemoteSenders(): Promise<string[]> {
  const prefs = await jsonRequest<PreferencesWithRemoteContent>("/user/preferences");
  return prefs.remote_content_senders ?? [];
}

export async function rememberRemoteSender(senderEmail: string): Promise<void> {
  const current = await trustedRemoteSenders();
  const normalized = senderEmail.trim().toLowerCase();
  const remote_content_senders = Array.from(new Set([...current, normalized]));
  await jsonRequest<PreferencesWithRemoteContent>("/user/preferences", {
    method: "PUT",
    body: JSON.stringify({ remote_content_senders }),
  });
}
