import { api } from "@/lib/api";
import type { MailActionId } from "@/lib/mail-actions";
import type { MessageDetail } from "@/lib/types";
import { prefixedSubject, safeRecipients } from "./mail-workspace-utils";

const AI_REPLY_INSTRUCTIONS: Partial<Record<MailActionId, string>> = {
  ai_reply: "Write a helpful reply to the sender in the sender's language.",
  ai_reply_short: "Write a concise reply. Keep only what is necessary.",
  ai_reply_friendly: "Write a warm, friendly reply.",
  ai_reply_professional: "Write a professional, polished reply.",
  ai_reply_direct: "Write a direct, clear reply without unnecessary filler.",
};

function forwardBody(source: MessageDetail): string {
  return [
    "",
    "---------- Forwarded message ----------",
    `From: ${source.from_email}`,
    `Date: ${source.date ?? ""}`,
    `Subject: ${source.subject}`,
    `To: ${source.to_emails.join(", ")}`,
    "",
    source.body_text,
  ].join("\n");
}

function recipients(
  source: MessageDetail,
  type: "reply" | "reply_all" | "forward",
) {
  if (type === "reply") return { to: [source.from_email], cc: [] as string[] };
  if (type === "forward") return { to: [] as string[], cc: [] as string[] };
  const to = safeRecipients(
    [source.from_email, ...source.to_emails],
    source.account_address,
  );
  const toSet = new Set(to.map((item) => item.toLowerCase()));
  const cc = safeRecipients(source.cc_emails, source.account_address).filter(
    (item) => !toSet.has(item.toLowerCase()),
  );
  return { to, cc };
}

export async function createReplyDraft(
  source: MessageDetail,
  type: "reply" | "reply_all" | "forward",
  aiAction?: MailActionId,
  customInstruction?: string,
): Promise<string> {
  const target = recipients(source, type);
  const draft = await api.createDraft({
    account_id: source.account_id,
    message_type: type,
    in_reply_to: type === "forward" ? null : source.message_id,
    references: Array.from(
      new Set([...source.references, source.message_id].filter(Boolean)),
    ),
    to_recipients: target.to,
    cc_recipients: target.cc,
    subject: prefixedSubject(
      source.subject,
      type === "forward" ? "Fwd:" : "Re:",
    ),
    body_text: type === "forward" ? forwardBody(source) : "",
    editor_mode: "rich_text",
  });
  if (!aiAction?.startsWith("ai_reply")) return draft.id;
  const instruction =
    customInstruction || AI_REPLY_INSTRUCTIONS[aiAction] || "";
  if (!instruction) return draft.id;
  const preview = await api.previewWriting(draft.id, {
    action: "custom",
    scope: "full",
    instruction,
  });
  await api.updateDraft(draft.id, {
    body_text: preview.text,
    body_html: null,
    editor_mode: "rich_text",
  });
  return draft.id;
}

export function translationLanguage(action: MailActionId): string | null {
  if (action === "ai_translate_de") return "German";
  if (action === "ai_translate_en") return "English";
  if (action === "ai_translate_es") return "Spanish";
  return null;
}

export async function previewMessageAI(
  detail: MessageDetail,
  action: MailActionId,
  instruction: string,
): Promise<string> {
  const language = translationLanguage(action);
  const draft = await api.createDraft({
    account_id: detail.account_id,
    message_type: "new",
    subject: `AI: ${detail.subject}`,
    body_text: detail.body_text,
    editor_mode: "rich_text",
  });
  try {
    const preview = await api.previewWriting(draft.id, {
      action: language ? "translate" : "custom",
      scope: "full",
      target_language: language || undefined,
      instruction: language ? undefined : instruction,
    });
    return preview.text;
  } finally {
    await api.discardDraft(draft.id).catch(() => undefined);
  }
}
