import { API_BASE } from "./config";
import type { MailActionResult } from "./types";

export interface MoveUndoRequest {
  message_id: string;
  current_folder: string;
  original_folder: string;
}

export async function undoMailMove(
  accountId: string,
  payload: MoveUndoRequest,
): Promise<MailActionResult> {
  const response = await fetch(
    `${API_BASE}/mail-client/accounts/${encodeURIComponent(accountId)}/moves/undo`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new Error((body?.detail as string | undefined) ?? response.statusText);
  }
  return body as MailActionResult;
}
