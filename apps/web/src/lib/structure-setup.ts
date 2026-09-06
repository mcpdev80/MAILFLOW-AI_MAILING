import { API_BASE } from "./config";

export type StructureAction = "reuse" | "create";

export interface StructureProposalItem {
  internal_id: string;
  proposed_name: string;
  existing_match: string | null;
  match_confidence: number;
  match_kind: "exact" | "equivalent" | "possible" | "none";
  suggested_action: "reuse" | "review" | "create";
}

export interface StructureRoute {
  category: string;
  subcategory: string | null;
  folder_id: string;
}

export interface StructureProposal {
  locale: "de" | "en" | "es";
  existing_folders: string[];
  existing_tags: string[];
  folders: StructureProposalItem[];
  tags: StructureProposalItem[];
  routes: StructureRoute[];
  current_config: Record<string, unknown>;
}

export interface StructureDraftItem {
  internal_id: string;
  mailbox_name: string;
  action: StructureAction;
}

export interface StructureDraft {
  account_id: string;
  locale: "de" | "en" | "es";
  folders: StructureDraftItem[];
  tags: StructureDraftItem[];
  routes: StructureRoute[];
}

export interface StructureApplyResult {
  created_folders: string[];
  reused_folders: string[];
  tag_mappings: Record<string, string>;
  structure_config: Record<string, unknown>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok)
    throw new Error(
      (body?.detail as string | undefined) ?? response.statusText,
    );
  return body as T;
}

export function loadStructureProposal(
  accountId: string,
  locale: "de" | "en" | "es",
) {
  return request<StructureProposal>(
    `/accounts/${accountId}/structure/proposal?locale=${locale}`,
  );
}

export function applyStructure(accountId: string, draft: StructureDraft) {
  return request<StructureApplyResult>(
    `/accounts/${accountId}/structure/apply`,
    {
      method: "POST",
      body: JSON.stringify({
        locale: draft.locale,
        folders: draft.folders,
        tags: draft.tags,
        routes: draft.routes,
      }),
    },
  );
}

export function proposalToDraft(
  accountId: string,
  proposal: StructureProposal,
): StructureDraft {
  const mapItem = (item: StructureProposalItem): StructureDraftItem => ({
    internal_id: item.internal_id,
    mailbox_name: item.existing_match ?? item.proposed_name,
    action: item.suggested_action === "reuse" ? "reuse" : "create",
  });
  return {
    account_id: accountId,
    locale: proposal.locale,
    folders: proposal.folders.map(mapItem),
    tags: proposal.tags.map(mapItem),
    routes: proposal.routes.map((route) => ({ ...route })),
  };
}

function storageKey(accountId: string) {
  return `mailflow:structure-draft:${accountId}`;
}

export function saveStructureDraft(draft: StructureDraft) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    storageKey(draft.account_id),
    JSON.stringify(draft),
  );
}

export function readStructureDraft(accountId: string): StructureDraft | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(storageKey(accountId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StructureDraft;
    return parsed.account_id === accountId ? parsed : null;
  } catch {
    return null;
  }
}

export function clearStructureDraft(accountId: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(storageKey(accountId));
}
