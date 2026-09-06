import { API_BASE } from "./config";

export interface DomainRule {
  id: string;
  account_id: string;
  domain: string;
  label: string;
  rule_id: string;
  priority: number;
}

export interface KeywordRule {
  id: string;
  account_id: string;
  keywords: string[];
  label: string;
  rule_id: string;
  priority: number;
  match_all: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new Error((body?.detail as string | undefined) ?? response.statusText);
  return body as T;
}

export const rulesApi = {
  listDomain: (accountId: string) => request<DomainRule[]>(`/accounts/${accountId}/domain-rules`),
  createDomain: (accountId: string, payload: { domain: string; label: string; rule_id: string; priority?: number }) => request<DomainRule>(`/accounts/${accountId}/domain-rules`, { method: "POST", body: JSON.stringify(payload) }),
  deleteDomain: (accountId: string, ruleId: string) => request<void>(`/accounts/${accountId}/domain-rules/${ruleId}`, { method: "DELETE" }),
  listKeyword: (accountId: string) => request<KeywordRule[]>(`/accounts/${accountId}/keyword-rules`),
  createKeyword: (accountId: string, payload: { keywords: string[]; label: string; rule_id: string; priority?: number; match_all?: boolean }) => request<KeywordRule>(`/accounts/${accountId}/keyword-rules`, { method: "POST", body: JSON.stringify(payload) }),
  deleteKeyword: (accountId: string, ruleId: string) => request<void>(`/accounts/${accountId}/keyword-rules/${ruleId}`, { method: "DELETE" }),
};
