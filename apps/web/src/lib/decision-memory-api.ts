import { API_BASE } from "./config";
import type { DecisionMemoryEntry, DecisionMemoryWrite } from "./types";

export async function createDecisionMemory(
  accountId: string,
  payload: DecisionMemoryWrite,
): Promise<DecisionMemoryEntry> {
  const response = await fetch(
    `${API_BASE}/accounts/${accountId}/decision-memory`,
    {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok)
    throw new Error(
      (body?.detail as string | undefined) ?? response.statusText,
    );
  return body as DecisionMemoryEntry;
}
