import type { MessageType, WritingAction } from "@/lib/types";

export const AUTOSAVE_MS = 900;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const AI_ACTIONS: readonly WritingAction[] = [
  "draft_reply",
  "draft_from_points",
  "improve",
  "shorten",
  "expand",
  "friendlier",
  "professional",
  "direct",
  "formal",
  "informal",
  "proofread",
  "same_language",
  "translate",
  "custom",
];

export function splitRecipients(value: string): string[] {
  return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

export function joinRecipients(values: string[]): string {
  return values.join(", ");
}

export function normalizeMessageType(value: string | null): MessageType {
  return value === "reply" || value === "reply_all" || value === "forward" ? value : "new";
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("file_read_failed"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.slice(value.indexOf(",") + 1) : value);
    };
    reader.readAsDataURL(file);
  });
}

export function textToHtml(value: string): string {
  const escaped = value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br>")}</p>`)
    .join("");
}
