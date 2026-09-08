"use client";

import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type {
  InboxMessage,
  MailboxMetadata,
  MessageDetail,
  ThreadView,
  UnifiedInbox,
} from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { messageKey } from "./mail-workspace-utils";

export type MailDeepLinkTarget = {
  account: string | null;
  folder: string | null;
  uid: number | null;
};

type MessageViewOptions = {
  target: MailDeepLinkTarget;
  inbox: UnifiedInbox | null;
  loading: boolean;
  selectedAccountId: string | null;
  ensureMetadata: (accountId: string) => Promise<MailboxMetadata>;
  setInbox: React.Dispatch<React.SetStateAction<UnifiedInbox | null>>;
  setError: (value: string | null) => void;
};

export function useMailMessageView(options: MessageViewOptions) {
  const { t } = useI18n();
  const openedDeepLink = useRef(false);
  const [selected, setSelected] = useState<MessageDetail | null>(null);
  const [thread, setThread] = useState<ThreadView | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: changing mailboxes must clear the selected message.
  useEffect(() => {
    setSelected(null);
    setThread(null);
  }, [options.selectedAccountId]);

  const openDetail = useCallback(
    async (accountId: string, folder: string, uid: number) => {
      setMessageLoading(true);
      options.setError(null);
      try {
        const [detail, metadata] = await Promise.all([
          api.messageDetail(accountId, folder, uid),
          options.ensureMetadata(accountId),
        ]);
        const resolved = await markReadIfNeeded(
          detail,
          metadata,
          options.setInbox,
        );
        setSelected(resolved);
        setThread(await loadThread(resolved));
      } catch (err) {
        options.setError(apiErrorMessage(err, t("mail.openFailed")));
      } finally {
        setMessageLoading(false);
      }
    },
    [options.ensureMetadata, options.setError, options.setInbox, t],
  );

  const openMessage = useCallback(
    async (message: InboxMessage) => {
      await openDetail(message.account_id, message.folder, message.uid);
    },
    [openDetail],
  );

  useEffect(() => {
    const target = options.target;
    if (
      openedDeepLink.current ||
      !target.uid ||
      !target.account ||
      !target.folder
    )
      return;

    // A review/search deep link must open the requested message even when it is
    // older than the currently loaded inbox page. Do not depend on the first 60
    // visible messages being present before resolving the target.
    openedDeepLink.current = true;
    void openDetail(target.account, target.folder, target.uid);
  }, [openDetail, options.target]);

  const detailFor = useCallback(
    async (message: InboxMessage) => {
      if (selected && messageKey(selected) === messageKey(message))
        return selected;
      return api.messageDetail(message.account_id, message.folder, message.uid);
    },
    [selected],
  );

  function clearSelection() {
    openedDeepLink.current = true;
    setSelected(null);
    setThread(null);
  }

  return {
    selected,
    setSelected,
    thread,
    setThread,
    messageLoading,
    openMessage,
    detailFor,
    clearSelection,
  };
}

async function markReadIfNeeded(
  detail: MessageDetail,
  metadata: MailboxMetadata,
  setInbox: React.Dispatch<React.SetStateAction<UnifiedInbox | null>>,
): Promise<MessageDetail> {
  if (detail.seen || !metadata.capabilities.read_state) return detail;
  await api.mailAction(detail.account_id, detail.folder, detail.uid, {
    action: "mark_read",
  });
  setInbox((current) => updateUnreadState(current, detail));
  return { ...detail, seen: true };
}

function updateUnreadState(
  current: UnifiedInbox | null,
  detail: MessageDetail,
): UnifiedInbox | null {
  if (!current) return current;
  return {
    ...current,
    total_unread: Math.max(0, current.total_unread - 1),
    messages: current.messages.map((item) =>
      messageKey(item) === messageKey(detail) ? { ...item, seen: true } : item,
    ),
    counters: current.counters.map((item) =>
      item.account_id === detail.account_id && item.folder === detail.folder
        ? { ...item, unread: Math.max(0, item.unread - 1) }
        : item,
    ),
  };
}

async function loadThread(detail: MessageDetail): Promise<ThreadView | null> {
  return detail.thread_id
    ? api.threadDetail(detail.account_id, detail.thread_id)
    : null;
}

function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}
