"use client";

import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { undoMailMove } from "@/lib/mail-ux-api";
import type {
  InboxMessage,
  MailActionRequest,
  MessageDetail,
  ThreadView,
  UnifiedInbox,
} from "@/lib/types";
import { useState } from "react";
import { messageKey } from "./mail-workspace-utils";

type UndoMove = {
  account_id: string;
  message_id: string;
  current_folder: string;
  original_folder: string;
};

type MoveActionOptions = {
  inbox: UnifiedInbox | null;
  selected: MessageDetail | null;
  selectedAccountId: string | null;
  setSelected: (value: MessageDetail | null) => void;
  setThread: (value: ThreadView | null) => void;
  setError: (value: string | null) => void;
  loadInbox: () => Promise<void>;
};

export function useMailMoveActions(options: MoveActionOptions) {
  const { t } = useI18n();
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [dragMessages, setDragMessages] = useState<InboxMessage[]>([]);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [undoMoves, setUndoMoves] = useState<UndoMove[]>([]);

  async function runActionFor(
    message: InboxMessage,
    payload: MailActionRequest,
  ) {
    if (!confirmAction(payload.action, t)) return;
    setActionLoading(true);
    options.setError(null);
    try {
      const result = await api.mailAction(
        message.account_id,
        message.folder,
        message.uid,
        payload,
      );
      await refreshSelectedAfterAction(
        message,
        result.destination_folder,
        options,
      );
      await options.loadInbox();
    } catch (err) {
      options.setError(apiErrorMessage(err, t("mail.actionFailed")));
    } finally {
      setActionLoading(false);
    }
  }

  function toggleSelection(message: InboxMessage) {
    const key = messageKey(message);
    setSelectedKeys((current) => toggleKey(current, key));
  }

  function selectionForDrag(message: InboxMessage): InboxMessage[] {
    if (!selectedKeys.has(messageKey(message))) return [message];
    return (options.inbox?.messages ?? []).filter(
      (item) =>
        selectedKeys.has(messageKey(item)) &&
        item.account_id === message.account_id,
    );
  }

  async function dropMessagesIntoFolder(destination: string) {
    const candidates = moveCandidates(
      options.selectedAccountId,
      dragMessages,
      destination,
    );
    if (!candidates.length) return;
    setActionLoading(true);
    const completed: UndoMove[] = [];
    try {
      await moveCandidatesToFolder(candidates, destination, completed);
      setUndoMoves(completed);
      clearSelectionState(options, setSelectedKeys);
    } catch (err) {
      options.setError(apiErrorMessage(err, t("mail.moveBatchFailed")));
      if (completed.length) setUndoMoves(completed);
    } finally {
      setDragMessages([]);
      setDragTarget(null);
      setActionLoading(false);
      await options.loadInbox();
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
      options.setError(apiErrorMessage(err, t("mail.undoFailed")));
    } finally {
      setActionLoading(false);
      await options.loadInbox();
    }
  }

  function clearBatchSelection() {
    setSelectedKeys(new Set());
  }

  return {
    actionLoading,
    selectedKeys,
    toggleSelection,
    clearBatchSelection,
    dragMessages,
    setDragMessages,
    dragTarget,
    setDragTarget,
    undoMoves,
    setUndoMoves,
    selectionForDrag,
    dropMessagesIntoFolder,
    undoLastMove,
    runActionFor,
  };
}

function confirmAction(
  action: MailActionRequest["action"],
  t: ReturnType<typeof useI18n>["t"],
): boolean {
  if (action === "trash") return window.confirm(t("mail.trashConfirm"));
  if (action === "spam") return window.confirm(t("mail.spamConfirm"));
  return true;
}

async function refreshSelectedAfterAction(
  message: InboxMessage,
  destination: string | null,
  options: MoveActionOptions,
) {
  if (!options.selected || messageKey(options.selected) !== messageKey(message))
    return;
  if (destination && destination !== message.folder) {
    options.setSelected(null);
    options.setThread(null);
    return;
  }
  options.setSelected(
    await api.messageDetail(message.account_id, message.folder, message.uid),
  );
}

function toggleKey(current: Set<string>, key: string): Set<string> {
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

function moveCandidates(
  accountId: string | null,
  messages: InboxMessage[],
  destination: string,
): InboxMessage[] {
  if (!accountId) return [];
  return messages.filter(
    (item) => item.account_id === accountId && item.folder !== destination,
  );
}

async function moveCandidatesToFolder(
  candidates: InboxMessage[],
  destination: string,
  completed: UndoMove[],
) {
  for (const item of candidates) {
    await api.mailAction(item.account_id, item.folder, item.uid, {
      action: "move",
      destination_folder: destination,
    });
    completed.push({
      account_id: item.account_id,
      message_id: item.message_id,
      current_folder: destination,
      original_folder: item.folder,
    });
  }
}

function clearSelectionState(
  options: MoveActionOptions,
  setSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>,
) {
  setSelectedKeys(new Set());
  options.setSelected(null);
  options.setThread(null);
}

function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : fallback;
}
