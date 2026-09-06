"use client";

import { useSearchParams } from "next/navigation";
import { useRef } from "react";
import { useMailContextActions } from "./use-mail-context-actions";
import { useMailMessageView } from "./use-mail-message-view";
import { useMailMoveActions } from "./use-mail-move-actions";
import { useMailboxNavigation } from "./use-mailbox-navigation";

export function useMailWorkspace() {
  const params = useSearchParams();
  const initialTarget = useRef({
    account: params.get("account"),
    folder: params.get("folder"),
    uid: Number(params.get("uid") || 0) || null,
  }).current;

  const navigation = useMailboxNavigation({
    account: initialTarget.account,
    folder: initialTarget.folder,
  });
  const messageView = useMailMessageView({
    target: initialTarget,
    inbox: navigation.inbox,
    loading: navigation.loading,
    selectedAccountId: navigation.selectedAccountId,
    ensureMetadata: navigation.ensureMetadata,
    setInbox: navigation.setInbox,
    setError: navigation.setError,
  });
  const moves = useMailMoveActions({
    inbox: navigation.inbox,
    selected: messageView.selected,
    selectedAccountId: navigation.selectedAccountId,
    setSelected: messageView.setSelected,
    setThread: messageView.setThread,
    setError: navigation.setError,
    loadInbox: navigation.loadInbox,
  });
  const context = useMailContextActions({
    selected: messageView.selected,
    setSelected: messageView.setSelected,
    setThread: messageView.setThread,
    detailFor: messageView.detailFor,
    ensureMetadata: navigation.ensureMetadata,
    runActionFor: moves.runActionFor,
    setError: navigation.setError,
  });

  function changeAccount(id: string) {
    messageView.clearSelection();
    moves.clearBatchSelection();
    navigation.changeAccount(id);
  }

  return {
    ...navigation,
    ...messageView,
    ...moves,
    ...context,
    changeAccount,
  };
}
