import { API_BASE } from "./config";

export type AttachmentFolder = {
  id: string;
  parent_id: string | null;
  name: string;
  managed_by: "ai" | "user" | string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type AttachmentSource = {
  id: string;
  account_id: string;
  uid: number;
  folder: string;
  message_id: string | null;
  thread_id: string | null;
  from_email: string;
  subject: string;
  received_at: string | null;
  source_filename: string;
  mime_type: string;
  size_bytes: number | null;
};

export type AttachmentDocument = {
  id: string;
  canonical_filename: string;
  mime_type: string;
  size_bytes: number;
  analysis_status: string;
  document_type: string | null;
  ai_category: string | null;
  ai_subcategory: string | null;
  ai_confidence: number | null;
  category: string | null;
  subcategory: string | null;
  tags: string[];
  folder_id: string | null;
  source_count: number;
  created_at: string;
  updated_at: string;
};

export type AttachmentDetail = AttachmentDocument & {
  extracted_text: string | null;
  sources: AttachmentSource[];
};

export type BlockedAttachment = {
  id: string;
  account_id: string;
  uid: number;
  folder: string;
  message_id: string | null;
  from_email: string;
  subject: string;
  received_at: string | null;
  source_filename: string;
  mime_type: string;
  size_bytes: number | null;
  safety_reason: string | null;
  created_at: string;
};

type Correction = {
  folder_id?: string | null;
  category?: string | null;
  subcategory?: string | null;
  tags?: string[];
  remember?: boolean;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => undefined);
  if (!response.ok)
    throw new Error(body?.detail ?? response.statusText ?? "request_failed");
  return body as T;
}

export const attachmentsApi = {
  list: (options: { q?: string; folderId?: string | null } = {}) => {
    const params = new URLSearchParams();
    if (options.q) params.set("q", options.q);
    if (options.folderId) params.set("folder_id", options.folderId);
    return request<AttachmentDocument[]>(`/attachments?${params.toString()}`);
  },
  detail: (id: string) => request<AttachmentDetail>(`/attachments/${id}`),
  folders: () => request<AttachmentFolder[]>("/attachments/folders"),
  createFolder: (name: string, parentId?: string | null) =>
    request<AttachmentFolder>("/attachments/folders", {
      method: "POST",
      body: JSON.stringify({ name, parent_id: parentId ?? null }),
    }),
  updateFolder: (
    id: string,
    payload: { name?: string; parent_id?: string | null },
  ) =>
    request<AttachmentFolder>(`/attachments/folders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteFolder: (id: string) =>
    request<void>(`/attachments/folders/${id}`, { method: "DELETE" }),
  correct: (id: string, payload: Correction) =>
    request<AttachmentDetail>(`/attachments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ tags: [], remember: false, ...payload }),
    }),
  blocked: () => request<BlockedAttachment[]>("/attachments/security"),
};

export function attachmentDownloadUrl(id: string): string {
  return `${API_BASE}/attachments/${encodeURIComponent(id)}/download`;
}

export function sourceMailUrl(
  source: AttachmentSource | BlockedAttachment,
): string {
  const params = new URLSearchParams({
    account_id: source.account_id,
    folder: source.folder,
    uid: String(source.uid),
  });
  return `/app/mail?${params.toString()}`;
}
