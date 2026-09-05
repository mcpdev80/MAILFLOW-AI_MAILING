/** Typed MailFlow API client through the same-origin BFF proxy. */
import { API_BASE } from "./config";
import type {
  Cycle,
  CycleEnqueued,
  DecisionMemoryEntry,
  DecisionMemoryWrite,
  DraftAttachment,
  DraftAttachmentCreate,
  DraftCreate,
  DraftUpdate,
  EmailAccount,
  EmailAccountCreate,
  EmailAccountUpdate,
  LLMProvider,
  LLMProviderCreate,
  LLMProviderUpdate,
  MailActionRequest,
  MailActionResult,
  MailDraft,
  MailboxMetadata,
  MailboxOwnershipUpdate,
  MessageDetail,
  PlanStatus,
  PreSendCheck,
  SendResult,
  SharedMailboxAccess,
  ThreadView,
  UnifiedInbox,
  UserPreferences,
  UserPreferencesUpdate,
  WritingPreview,
  WritingRequest,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const detail =
      (body && (body.detail as string)) || res.statusText || "request failed";
    throw new ApiError(res.status, detail);
  }
  return body as T;
}

export function mailAttachmentUrl(
  accountId: string,
  folder: string,
  uid: number,
  partId: string,
): string {
  const query = new URLSearchParams({ folder });
  return `${API_BASE}/mail-client/accounts/${encodeURIComponent(accountId)}/messages/${uid}/attachments/${encodeURIComponent(partId)}?${query.toString()}`;
}

export const api = {
  health: () => request<{ status: string; db: string }>("/health"),

  // Email accounts
  listAccounts: () => request<EmailAccount[]>("/accounts"),
  getAccount: (id: string) => request<EmailAccount>(`/accounts/${id}`),
  listManagedMailboxes: () =>
    request<EmailAccount[]>("/accounts/managed-mailboxes"),
  getManagedMailbox: (id: string) =>
    request<EmailAccount>(`/accounts/${id}/management`),
  createAccount: (payload: EmailAccountCreate) =>
    request<EmailAccount>("/accounts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateAccount: (id: string, payload: EmailAccountUpdate) =>
    request<EmailAccount>(`/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteAccount: (id: string) =>
    request<void>(`/accounts/${id}`, { method: "DELETE" }),
  listSharedAccess: (id: string) =>
    request<SharedMailboxAccess[]>(`/accounts/${id}/access`),
  replaceSharedAccess: (id: string, userIds: string[]) =>
    request<SharedMailboxAccess[]>(`/accounts/${id}/access`, {
      method: "PUT",
      body: JSON.stringify({ user_ids: userIds }),
    }),
  changeMailboxOwnership: (id: string, payload: MailboxOwnershipUpdate) =>
    request<EmailAccount>(`/accounts/${id}/ownership`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  listUnresolvedMailboxes: () =>
    request<EmailAccount[]>("/accounts/unresolved-mailboxes"),

  // User preferences
  getUserPreferences: () => request<UserPreferences>("/user/preferences"),
  updateUserPreferences: (payload: UserPreferencesUpdate) =>
    request<UserPreferences>("/user/preferences", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  // DecisionMemory
  listDecisionMemory: (accountId: string, includeDisabled = true) =>
    request<DecisionMemoryEntry[]>(
      `/accounts/${accountId}/decision-memory?include_disabled=${includeDisabled}`,
    ),
  updateDecisionMemory: (
    accountId: string,
    entryId: string,
    payload: DecisionMemoryWrite,
  ) =>
    request<DecisionMemoryEntry>(
      `/accounts/${accountId}/decision-memory/${entryId}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    ),
  deleteDecisionMemory: (accountId: string, entryId: string) =>
    request<void>(`/accounts/${accountId}/decision-memory/${entryId}`, {
      method: "DELETE",
    }),

  // Mail client
  unifiedInbox: (options?: {
    accountId?: string | null;
    folder?: string | null;
    beforeUid?: number | null;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (options?.accountId) params.set("account_id", options.accountId);
    if (options?.folder) params.set("folder", options.folder);
    if (options?.beforeUid != null)
      params.set("before_uid", String(options.beforeUid));
    params.set("limit", String(options?.limit ?? 50));
    return request<UnifiedInbox>(`/mail-client/inbox?${params.toString()}`);
  },
  mailboxMetadata: (accountId: string) =>
    request<MailboxMetadata>(`/mail-client/accounts/${accountId}/metadata`),
  messageDetail: (accountId: string, folder: string, uid: number) => {
    const params = new URLSearchParams({ folder });
    return request<MessageDetail>(
      `/mail-client/accounts/${accountId}/messages/${uid}?${params.toString()}`,
    );
  },
  threadDetail: (accountId: string, threadId: string) =>
    request<ThreadView>(
      `/mail-client/accounts/${accountId}/threads/${encodeURIComponent(threadId)}`,
    ),
  mailAction: (
    accountId: string,
    folder: string,
    uid: number,
    payload: MailActionRequest,
  ) => {
    const params = new URLSearchParams({ folder });
    return request<MailActionResult>(
      `/mail-client/accounts/${accountId}/messages/${uid}/actions?${params.toString()}`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  },

  // Outbound mail
  listDrafts: (includeSent = false) =>
    request<MailDraft[]>(`/mail/drafts?include_sent=${includeSent}`),
  getDraft: (id: string) => request<MailDraft>(`/mail/drafts/${id}`),
  createDraft: (payload: DraftCreate) =>
    request<MailDraft>("/mail/drafts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateDraft: (id: string, payload: DraftUpdate) =>
    request<MailDraft>(`/mail/drafts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  discardDraft: (id: string) =>
    request<void>(`/mail/drafts/${id}`, { method: "DELETE" }),
  addDraftAttachment: (id: string, payload: DraftAttachmentCreate) =>
    request<DraftAttachment>(`/mail/drafts/${id}/attachments`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  removeDraftAttachment: (draftId: string, attachmentId: string) =>
    request<void>(`/mail/drafts/${draftId}/attachments/${attachmentId}`, {
      method: "DELETE",
    }),
  previewWriting: (draftId: string, payload: WritingRequest) =>
    request<WritingPreview>(`/mail/drafts/${draftId}/ai/preview`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  preSendCheck: (id: string) =>
    request<PreSendCheck>(`/mail/drafts/${id}/pre-send`),
  sendDraft: (id: string) =>
    request<SendResult>(`/mail/drafts/${id}/send`, { method: "POST" }),

  // LLM providers
  listProviders: () => request<LLMProvider[]>("/llm-providers"),
  getProvider: (id: string) => request<LLMProvider>(`/llm-providers/${id}`),
  createProvider: (payload: LLMProviderCreate) =>
    request<LLMProvider>("/llm-providers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateProvider: (id: string, payload: LLMProviderUpdate) =>
    request<LLMProvider>(`/llm-providers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  // Cycles
  listCycles: (accountId: string) =>
    request<Cycle[]>(`/accounts/${accountId}/cycles`),
  runCycle: (accountId: string) =>
    request<CycleEnqueued>(`/accounts/${accountId}/cycles/run`, {
      method: "POST",
    }),

  // OAuth — returns the provider consent URL to redirect the browser to.
  oauthAuthorizeUrl: (
    provider: "gmail" | "microsoft",
    options?: {
      ownershipMode?: "private" | "shared";
      sharedUserIds?: string[];
    },
  ) => {
    const params = new URLSearchParams();
    if (options?.ownershipMode) {
      params.set("ownership_mode", options.ownershipMode);
    }
    for (const userId of options?.sharedUserIds ?? []) {
      params.append("shared_user_ids", userId);
    }
    const query = params.size > 0 ? `?${params.toString()}` : "";
    return request<{ authorize_url: string }>(
      `/oauth/${provider}/authorize${query}`,
    );
  },

  // Billing
  planStatus: () => request<PlanStatus>("/billing/plan"),
  checkout: (plan: "pro" | "team", seats?: number) =>
    request<{ url: string }>("/billing/checkout", {
      method: "POST",
      body: JSON.stringify(seats != null ? { plan, seats } : { plan }),
    }),
  billingPortal: () =>
    request<{ url: string }>("/billing/portal", { method: "POST" }),
};
