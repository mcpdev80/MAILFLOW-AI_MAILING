"use client";

import type { ContextMenuPosition } from "@/components/mail-context-menu";
import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { MailActionId } from "@/lib/mail-actions";
import type {
  InboxMessage,
  MailActionRequest,
  MailboxCapabilities,
  MailboxMetadata,
  MessageDetail,
  ThreadInsights,
  ThreadView,
} from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createReplyDraft,
  previewMessageAI,
  translationLanguage,
} from "./mail-draft-actions";

type AiResult = { title: string; body: string };
type ContextMenuState = {
  position: ContextMenuPosition;
  message: InboxMessage;
  capabilities: MailboxCapabilities;
};

type ContextActionOptions = {
  selected: MessageDetail | null;
  setSelected: (value: MessageDetail | null) => void;
  setThread: (value: ThreadView | null) => void;
  detailFor: (message: InboxMessage) => Promise<MessageDetail>;
  ensureMetadata: (accountId: string) => Promise<MailboxMetadata>;
  runActionFor: (message: InboxMessage, payload: MailActionRequest) => Promise<void>;
  setError: (value: string | null) => void;
};

export function useMailContextActions(options: ContextActionOptions) {
  const router = useRouter();
  const { t } = useI18n();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);

  async function openContextMenuAt(message: InboxMessage, position: ContextMenuPosition) {
    try {
      const metadata = await options.ensureMetadata(message.account_id);
      setContextMenu({ position, message, capabilities: metadata.capabilities });
    } catch (err) {
      options.setError(apiErrorMessage(err, t("mail.actionsFailed")));
    }
  }

  async function openReply(
    type: "reply" | "reply_all" | "forward",
    source?: InboxMessage,
    aiAction?: MailActionId,
  ) {
    const detail = source ? await options.detailFor(source) : options.selected;
    if (!detail) return;
    const customInstruction = aiAction === "ai_reply_custom" ? customReplyInstruction(t("mail.customReplyPrompt")) : undefined;
    if (aiAction === "ai_reply_custom" && !customInstruction) return;
    try {
      const id = await createReplyDraft(detail, type, aiAction, customInstruction);
      router.push(`/app/compose?draft=${encodeURIComponent(id)}`);
    } catch (err) {
      options.setError(apiErrorMessage(err, t("mail.replyDraftFailed")));
    }
  }

  async function executeContextAction(action: MailActionId, message: InboxMessage) {
    if (isReplyAction(action)) return openReply(action, message);
    if (action.startsWith("ai_reply")) return openReply("reply", message, action);
    if (isInsightAction(action)) return showInsight(action, message, options, setAiResult, t);
    if (action.startsWith("ai_translate_") || action === "ai_custom") {
      return showGeneratedAI(action, message, options, setAiResult, t);
    }
    if (isDirectMailAction(action)) return options.runActionFor(message, { action });
    if (action === "move") return moveFromContext(message, options, t("mail.movePrompt"));
    if (action === "print_message" || action === "print_thread") return printMessage(action, await options.detailFor(message));
    if (action === "message_details") setAiResult(messageDetails(await options.detailFor(message), t("mail.messageDetails")));
  }

  return {
    contextMenu,
    setContextMenu,
    aiResult,
    setAiResult,
    openContextMenuAt,
    openReply,
    executeContextAction,
  };
}

function isReplyAction(action: MailActionId): action is "reply" | "reply_all" | "forward" {
  return action === "reply" || action === "reply_all" || action === "forward";
}

function isInsightAction(action: MailActionId): boolean {
  return ["ai_summarize", "ai_key_points", "ai_todos", "ai_questions", "ai_deadlines"].includes(action);
}

function isDirectMailAction(action: MailActionId): action is MailActionRequest["action"] {
  return ["mark_read", "mark_unread", "flag", "unflag", "archive", "spam", "trash"].includes(action);
}

async function showInsight(
  action: MailActionId,
  message: InboxMessage,
  options: ContextActionOptions,
  setAiResult: (value: AiResult) => void,
  t: ReturnType<typeof useI18n>["t"],
) {
  const detail = await options.detailFor(message);
  const context = detail.thread_id ? await api.threadDetail(detail.account_id, detail.thread_id) : null;
  options.setSelected(detail);
  options.setThread(context);
  setAiResult(insightResult(action, context?.insights ?? null, t));
}

async function showGeneratedAI(
  action: MailActionId,
  message: InboxMessage,
  options: ContextActionOptions,
  setAiResult: (value: AiResult) => void,
  t: ReturnType<typeof useI18n>["t"],
) {
  const detail = await options.detailFor(message);
  const language = translationLanguage(action);
  const instruction = language || window.prompt(t("mail.customAiPrompt"))?.trim() || "";
  if (!instruction) return;
  try {
    setAiResult({
      title: language ? `${t("mail.translation")} · ${language}` : t("mail.aiResult"),
      body: await previewMessageAI(detail, action, instruction),
    });
  } catch (err) {
    options.setError(apiErrorMessage(err, t("mail.aiActionFailed")));
  }
}

async function moveFromContext(
  message: InboxMessage,
  options: ContextActionOptions,
  promptTemplate: string,
) {
  const metadata = await options.ensureMetadata(message.account_id);
  const names = metadata.folders
    .filter((item) => item.selectable && item.name !== message.folder)
    .map((item) => item.name);
  const destination = window.prompt(promptTemplate.replace("{folders}", names.join("\n")))?.trim();
  if (destination && names.includes(destination)) {
    await options.runActionFor(message, { action: "move", destination_folder: destination });
  }
}

function printMessage(action: MailActionId, detail: MessageDetail) {
  const query = new URLSearchParams({
    account: detail.account_id,
    folder: detail.folder,
    uid: String(detail.uid),
    mode: action === "print_thread" ? "thread" : "message",
  });
  window.open(`/print/mail?${query.toString()}`, "_blank", "noopener,noreferrer");
}

function messageDetails(detail: MessageDetail, title: string): AiResult {
  return {
    title,
    body: [
      `Message-ID: ${detail.message_id}`,
      `From: ${detail.from_email}`,
      `To: ${detail.to_emails.join(", ")}`,
      `Folder: ${detail.folder}`,
      `UID: ${detail.uid}`,
    ].join("\n"),
  };
}

function insightResult(
  action: MailActionId,
  insights: ThreadInsights | null,
  t: ReturnType<typeof useI18n>["t"],
): AiResult {
  if (!insights) return { title: t("mail.aiInsight"), body: t("mail.noInsight") };
  if (action === "ai_summarize") return { title: t("mail.summary"), body: insights.overview };
  if (action === "ai_key_points") return { title: t("mail.keyPoints"), body: bulletList(insights.key_points, t("mail.noKeyPoints")) };
  if (action === "ai_todos") return { title: t("mail.todos"), body: bulletList(insights.todos, t("mail.noTodos")) };
  if (action === "ai_questions") return { title: t("mail.openQuestions"), body: bulletList(insights.open_questions, t("mail.noQuestions")) };
  return { title: t("mail.deadlinesDates"), body: insights.deadline || t("mail.noDeadline") };
}

function bulletList(items: string[], empty: string): string {
  return items.length ? items.map((item) => `• ${item}`).join("\n") : empty;
}

function customReplyInstruction(prompt: string): string | undefined {
  return window.prompt(prompt)?.trim() || undefined;
}

function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}
