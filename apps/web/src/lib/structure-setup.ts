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

export interface StructureCurrent {
  configured: boolean;
  config: Record<string, unknown>;
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

export function loadStructureCurrent(accountId: string) {
  return request<StructureCurrent>(`/accounts/${accountId}/structure/current`);
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

function asStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function asRoutes(value: unknown): StructureRoute[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.category !== "string" || typeof row.folder_id !== "string")
      return [];
    return [
      {
        category: row.category,
        subcategory:
          typeof row.subcategory === "string" ? row.subcategory : null,
        folder_id: row.folder_id,
      },
    ];
  });
}

export function currentToDraft(
  accountId: string,
  current: StructureCurrent,
  fallbackLocale: "de" | "en" | "es" = "en",
): StructureDraft | null {
  if (!current.configured) return null;
  const config = current.config;
  const localeValue = config.locale_at_setup;
  const locale =
    localeValue === "de" || localeValue === "en" || localeValue === "es"
      ? localeValue
      : fallbackLocale;
  const folders = asStringMap(config.folders);
  const tags = asStringMap(config.tags);
  return {
    account_id: accountId,
    locale,
    folders: Object.entries(folders).map(([internal_id, mailbox_name]) => ({
      internal_id,
      mailbox_name,
      action: "reuse",
    })),
    tags: Object.entries(tags).map(([internal_id, mailbox_name]) => ({
      internal_id,
      mailbox_name,
      action: "reuse",
    })),
    routes: asRoutes(config.routes),
  };
}

export function mergeStructureDraft(
  discovered: StructureDraft,
  persisted: StructureDraft | null,
): StructureDraft {
  if (!persisted) return discovered;

  const mergeItems = (
    discoveredItems: StructureDraftItem[],
    persistedItems: StructureDraftItem[],
  ) => {
    const saved = new Map(
      persistedItems.map((item) => [item.internal_id, item] as const),
    );
    const merged = discoveredItems.map((item) => saved.get(item.internal_id) ?? item);
    const known = new Set(merged.map((item) => item.internal_id));
    for (const item of persistedItems) {
      if (!known.has(item.internal_id)) merged.push(item);
    }
    return merged;
  };

  const routeKey = (route: StructureRoute) =>
    `${route.category}\u0000${route.subcategory ?? ""}`;
  const savedRoutes = new Map(
    persisted.routes.map((route) => [routeKey(route), route] as const),
  );
  const routes = discovered.routes.map(
    (route) => savedRoutes.get(routeKey(route)) ?? route,
  );
  const knownRoutes = new Set(routes.map(routeKey));
  for (const route of persisted.routes) {
    if (!knownRoutes.has(routeKey(route))) routes.push(route);
  }

  return {
    ...discovered,
    locale: persisted.locale,
    folders: mergeItems(discovered.folders, persisted.folders),
    tags: mergeItems(discovered.tags, persisted.tags),
    routes,
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
