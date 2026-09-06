"use client";

import type { ContextMenuPosition } from "@/components/mail-context-menu";
import { ApiError, api } from "@/lib/api";
import type { MailActionId } from "@/lib/mail-actions";
import { undoMailMove } from "@/lib/mail-ux-api";
import type {
  EmailAccount,
  InboxMessage,
  MailActionRequest,
  MailboxCapabilities,
  MailboxMetadata,
  MessageDetail,
  ThreadInsights,
  ThreadView,
  UnifiedInbox,
} from "@/lib/types";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createReplyDraft,
  previewMessageAI,
  translationLanguage,
} from "./mail-draft-actions";
import { messageKey } from "./mail-workspace-utils";

type UndoMove = {
  account_id: string;
  message_id: string;
  current_folder: string;
  original_folder: string;
};

type AiResult = { title: string; body: string };
type ContextMenuState = {
  position: ContextMenuPosition;
  message: InboxMessage;
  capabilities: MailboxCapabilities;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function insightResult(action: MailActionId, insights: ThreadInsights | null): AiResult {
  if (!insights) {
    return { title: "AI insight", body: "No processed thread insight is available yet." };
  }
  if (action === "ai_summarize") return { title: "Summary", body: insights.overview };
  if (action === "ai_key_points") {
    return { title: "Key points", body: insights.key_points.join("\n• ") || "No key points detected." };
  }
  if (action === "ai_todos") {
    return { title: "To-dos", body: insights.todos.join("\n• ") || "No to-dos detected." };
  }
  if (action === "ai_questions") {
    return { title: "Open questions", body: insights.open_questions.join("\n• ") || "No open questions detected." };
  }
  return { title: "Deadlines / dates", body: insights.deadline || "No deadline detected." };
}

export function useMailWorkspace() {
  const router = useRouter();
  const params = useSearchParams();
  const initialTarget = useRef({
    account: params.get("account"),
    folder: params.get("folder"),
    uid: Number(params.get("uid") || 0) || null,
  });
  const openedDeepLink = useRef(false);

  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountFilter, setAccountFilter] = useState(initialTarget.current.account || "all");
  const [folder, setFolder] = useState<string | null>(initialTarget.current.folder);
  const [inbox, setInbox] = useState<UnifiedInbox | null>(null);
  const [metadata, setMetadata] = useState<MailboxMetadata | null>(null);
  const [selected, setSelected] = useState<MessageDetail | null>(null);
  const [thread, setThread] = useState<ThreadView | null>(null);
  const [moveFolder, setMoveFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [messageLoading, setMessageLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [dragMessages, setDragMessages] = useState<InboxMessage[]>([]);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [undoMoves, setUndoMoves] = useState<UndoMove[]>([]);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);

  const selectedAccountId = accountFilter === "all" ? null : accountFilter;
  const selectableFolders = useMemo(
    () => metadata?.folders.filter((item) => item.selectable) ?? [],
    [metadata],
  );
  const unreadByAccount = useMemo(
    () => new Map((inbox?.counters ?? []).map((item) => [item.account_id, item.unread])),
    [inbox],
  );

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInbox(
        await api.unifiedInbox({
          accountId: selectedAccountId,
          folder: selectedAccountId ? folder : null,
          limit: 60,
        }),
      );
    } catch (err) {
      setError(errorMessage(err, "Could not load mail"));
    } finally {
      setLoading(false);
    }
  }, [folder, selectedAccountId]);

  useEffect(() => {
    api.listAccounts().then(setAccounts).catch((err) => setError(errorMessage(err, "Could not load mailboxes")));
  }, []);

  useEffect(() => {
    setSelected(null);
    setThread(null);
    if (!selectedAccountId) {
      setMetadata(null);
      setFolder(null);
      setMoveFolder("");
      return;
    }
    api.mailboxMetadata(selectedAccountId).then((value) => {
      setMetadata(value);
      const inboxFolder = value.folders.find((item) => item.role === "inbox")?.name;
      setFolder((current) => current ?? inboxFolder ?? null);
      setMoveFolder(value.folders.find((item) => item.role === "archive")?.name ?? "");
    }).catch((err) => setError(errorMessage(err, "Could not load mailbox metadata")));
  }, [selectedAccountId]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  const ensureMetadata = useCallback(async (accountId: string) => {
    if (metadata && selectedAccountId === accountId) return metadata;
    const value = await api.mailboxMetadata(accountId);
    setMetadata(value);
    setMoveFolder(value.folders.find((item) => item.role === "archive")?.name ?? "");
    return value;
  }, [metadata, selectedAccountId]);

  const openMessage = useCallback(async (message: InboxMessage) => {
    setMessageLoading(true);
    setError(null);
    try {
      const [detail, meta] = await Promise.all([
        api.messageDetail(message.account_id, message.folder, message.uid),
        ensureMetadata(message.account_id),
      ]);
      let resolved = detail;
      if (!detail.seen && meta.capabilities.read_state) {
        await api.mailAction(detail.account_id, detail.folder, detail.uid, { action: "mark_read" });
        resolved = { ...detail, seen: true };
        setInbox((current) => current ? {
          ...current,
          total_unread: Math.max(0, current.total_unread - 1),
          messages: current.messages.map((item) => messageKey(item) === messageKey(detail) ? { ...item, seen: true } : item),
          counters: current.counters.map((item) => item.account_id === detail.account_id && item.folder === detail.folder ? { ...item, unread: Math.max(0, item.unread - 1) } : item),
        } : current);
      }
      setSelected(resolved);
      setThread(resolved.thread_id ? await api.threadDetail(resolved.account_id, resolved.thread_id) : null);
    } catch (err) {
      setError(errorMessage(err, "Could not open message"));
    } finally {
      setMessageLoading(false);
    }
  }, [ensureMetadata]);

  useEffect(() => {
    const target = initialTarget.current;
    if (openedDeepLink.current || loading || !inbox || !target.uid || !target.account) return;
    const message = inbox.messages.find((item) => item.account_id === target.account && item.uid === target.uid && (!target.folder || item.folder === target.folder));
    if (!message) return;
    openedDeepLink.current = true;
    void openMessage(message);
  }, [inbox, loading, openMessage]);

  async function runActionFor(message: InboxMessage, payload: MailActionRequest) {
    if (payload.action === "trash" && !window.confirm("Move this message to Trash?")) return;
    if (payload.action === "spam" && !window.confirm("Move this message to Spam/Junk?")) return;
    setActionLoading(true);
    setError(null);
    try {
      const result = await api.mailAction(message.account_id, message.folder, message.uid, payload);
      if (result.destination_folder && result.destination_folder !== message.folder) {
        if (selected && messageKey(selected) === messageKey(message)) {
          setSelected(null);
          setThread(null);
        }
      } else if (selected && messageKey(selected) === messageKey(message)) {
        setSelected(await api.messageDetail(message.account_id, message.folder, message.uid));
      }
      await loadInbox();
    } catch (err) {
      setError(errorMessage(err, "Mail action failed"));
    } finally {
      setActionLoading(false);
    }
  }

  async function openContextMenuAt(message: InboxMessage, position: ContextMenuPosition) {
    try {
      const meta = await ensureMetadata(message.account_id);
      setContextMenu({ position, message, capabilities: meta.capabilities });
    } catch (err) {
      setError(errorMessage(err, "Could not load message actions"));
    }
  }

  function toggleSelection(message: InboxMessage) {
    const key = messageKey(message);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectionForDrag(message: InboxMessage): InboxMessage[] {
    if (!selectedKeys.has(messageKey(message))) return [message];
    return (inbox?.messages ?? []).filter((item) => selectedKeys.has(messageKey(item)) && item.account_id === message.account_id);
  }

  async function dropMessagesIntoFolder(destination: string) {
    if (!selectedAccountId || dragMessages.length === 0) return;
    const candidates = dragMessages.filter((item) => item.account_id === selectedAccountId && item.folder !== destination);
    if (!candidates.length) return;
    setActionLoading(true);
    const completed: UndoMove[] = [];
    try {
      for (const item of candidates) {
        await api.mailAction(item.account_id, item.folder, item.uid, { action: "move", destination_folder: destination });
        completed.push({ account_id: item.account_id, message_id: item.message_id, current_folder: destination, original_folder: item.folder });
      }
      setUndoMoves(completed);
      setSelectedKeys(new Set());
      setSelected(null);
      setThread(null);
    } catch (err) {
      setError(errorMessage(err, "Could not move all selected messages"));
      if (completed.length) setUndoMoves(completed);
    } finally {
      setDragMessages([]);
      setDragTarget(null);
      setActionLoading(false);
      await loadInbox();
    }
  }

  async function undoLastMove() {
    if (!undoMoves.length) return;
    const pending = [...undoMoves];
    setUndoMoves([]);
    setActionLoading(true);
    try {
      for (const item of pending) await undoMailMove(item.account_id, item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not undo move");
    } finally {
      setActionLoading(false);
      await loadInbox();
    }
  }

  async function detailFor(message: InboxMessage): Promise<MessageDetail> {
    if (selected && messageKey(selected) === messageKey(message)) return selected;
    return api.messageDetail(message.account_id, message.folder, message.uid);
  }

  async function openReply(type: "reply" | "reply_all" | "forward", source?: InboxMessage, aiAction?: MailActionId) {
    const detail = source ? await detailFor(source) : selected;
    if (!detail) return;
    let customInstruction: string | undefined;
    if (aiAction === "ai_reply_custom") {
      customInstruction = window.prompt("How should AI write the reply?")?.trim() || undefined;
      if (!customInstruction) return;
    }
    try {
      const id = await createReplyDraft(detail, type, aiAction, customInstruction);
      router.push(`/app/compose?draft=${encodeURIComponent(id)}`);
    } catch (err) {
      setError(errorMessage(err, "Could not create reply draft"));
    }
  }

  async function showInsight(action: MailActionId, message: InboxMessage) {
    const detail = await detailFor(message);
    const context = detail.thread_id ? await api.threadDetail(detail.account_id, detail.thread_id) : null;
    setSelected(detail);
    setThread(context);
    setAiResult(insightResult(action, context?.insights ?? null));
  }

  async function showGeneratedAI(action: MailActionId, message: InboxMessage) {
    const detail = await detailFor(message);
    const language = translationLanguage(action);
    const instruction = language || window.prompt("What should AI do with this message?")?.trim() || "";
    if (!instruction) return;
    try {
      setAiResult({
        title: language ? `Translation · ${language}` : "AI result",
        body: await previewMessageAI(detail, action, instruction),
      });
    } catch (err) {
      setError(errorMessage(err, "AI action failed"));
    }
  }

  async function executeContextAction(action: MailActionId, message: InboxMessage) {
    if (["reply", "reply_all", "forward"].includes(action)) return openReply(action as "reply" | "reply_all" | "forward", message);
    if (action.startsWith("ai_reply")) return openReply("reply", message, action);
    if (["ai_summarize", "ai_key_points", "ai_todos", "ai_questions", "ai_deadlines"].includes(action)) return showInsight(action, message);
    if (action.startsWith("ai_translate_") || action === "ai_custom") return showGeneratedAI(action, message);
    if (action === "mark_read" || action === "mark_unread" || action === "flag" || action === "unflag" || action === "archive" || action === "spam" || action === "trash") {
      return runActionFor(message, { action });
    }
    if (action === "move") {
      const meta = await ensureMetadata(message.account_id);
      const names = meta.folders.filter((item) => item.selectable && item.name !== message.folder).map((item) => item.name);
      const destination = window.prompt(`Move to folder:\n${names.join("\n")}`)?.trim();
      if (destination && names.includes(destination)) return runActionFor(message, { action: "move", destination_folder: destination });
    }
    if (action === "print_message" || action === "print_thread") {
      const detail = await detailFor(message);
      const query = new URLSearchParams({ account: detail.account_id, folder: detail.folder, uid: String(detail.uid), mode: action === "print_thread" ? "thread" : "message" });
      window.open(`/print/mail?${query.toString()}`, "_blank", "noopener,noreferrer");
    }
    if (action === "message_details") {
      const detail = await detailFor(message);
      setAiResult({ title: "Message details", body: `Message-ID: ${detail.message_id}\nFrom: ${detail.from_email}\nTo: ${detail.to_emails.join(", ")}\nFolder: ${detail.folder}\nUID: ${detail.uid}` });
    }
  }

  function changeAccount(id: string) {
    openedDeepLink.current = true;
    setSelectedKeys(new Set());
    setFolder(null);
    setAccountFilter(id);
  }

  return {
    accounts, accountFilter, changeAccount, selectedAccountId, folder, setFolder,
    inbox, metadata, selected, thread, loading, messageLoading, actionLoading, error,
    contextMenu, setContextMenu, selectedKeys, toggleSelection, dragMessages, setDragMessages,
    dragTarget, setDragTarget, undoMoves, setUndoMoves, aiResult, setAiResult, moveFolder,
    setMoveFolder, selectableFolders, unreadByAccount, loadInbox, openMessage, openContextMenuAt,
    selectionForDrag, dropMessagesIntoFolder, undoLastMove, runActionFor, openReply,
    executeContextAction,
  };
}
