"use client";

import { ApiError, api } from "@/lib/api";
import { useCallback } from "react";
import type { useAccountDetailData } from "./use-account-detail-data";

type AccountData = ReturnType<typeof useAccountDetailData>;
type Push = (href: string) => void;

export function useAccountDetailActions(
  id: string,
  userId: string | undefined,
  push: Push,
  data: AccountData,
) {
  const runNow = useRunNow(id, data);
  const disconnect = useDisconnect(id, push, data);
  const saveSharedAccess = useSaveSharedAccess(id, userId, data);
  const makeShared = useMakeShared(id, data);
  const makePrivate = useMakePrivate(id, userId, push, data);
  const transferPrivateMailbox = useTransferPrivate(id, push, data);
  const toggleSharedUser = useCallback((memberId: string, checked: boolean) => {
    data.setSelectedSharedUsers((current) => checked
      ? [...new Set([...current, memberId])]
      : current.filter((value) => value !== memberId));
  }, [data.setSelectedSharedUsers]);
  return {
    runNow, disconnect, saveSharedAccess, makeShared, makePrivate,
    transferPrivateMailbox, toggleSharedUser,
  };
}

function useRunNow(id: string, data: AccountData) {
  return useCallback(async () => {
    if (!data.contentAccessible) return;
    await runBusy(data, async () => {
      await api.runCycle(id);
      window.setTimeout(() => void data.reload(), 1200);
    });
  }, [data, id]);
}

function useDisconnect(id: string, push: Push, data: AccountData) {
  return useCallback(async () => {
    data.setBusy(true);
    try {
      await api.deleteAccount(id);
      push("/app/dashboard");
    } catch (err) {
      data.setError(apiMessage(err, "mailbox_delete_failed"));
      data.setBusy(false);
    }
  }, [data, id, push]);
}

function useSaveSharedAccess(id: string, userId: string | undefined, data: AccountData) {
  return useCallback(async () => {
    await runBusy(data, async () => {
      const access = await api.replaceSharedAccess(id, data.selectedSharedUsers);
      data.setSharedAccess(access);
      const selected = access.filter((grant) => grant.can_use).map((grant) => grant.user_id);
      data.setSelectedSharedUsers(selected);
      const stillVisible = selected.includes(userId ?? "");
      data.setContentAccessible(stillVisible);
      if (!stillVisible) data.setCycles([]);
      data.setNotice("shared_access_updated");
    });
  }, [data, id, userId]);
}

function useMakeShared(id: string, data: AccountData) {
  return useCallback(async () => {
    await runBusy(data, async () => {
      await api.changeMailboxOwnership(id, {
        mode: "shared",
        shared_user_ids: data.selectedSharedUsers,
      });
      await data.reload();
      data.setNotice("mailbox_shared");
    });
  }, [data, id]);
}

function useMakePrivate(id: string, userId: string | undefined, push: Push, data: AccountData) {
  return useCallback(async () => {
    if (!data.transferUserId) return data.setError("select_private_owner");
    await runBusy(data, async () => {
      const updated = await api.changeMailboxOwnership(id, {
        mode: "private",
        target_owner_user_id: data.transferUserId,
      });
      if (updated.owner_user_id !== userId) return push("/app/dashboard");
      await data.reload();
      data.setNotice("mailbox_private");
    });
  }, [data, id, push, userId]);
}

function useTransferPrivate(id: string, push: Push, data: AccountData) {
  return useCallback(async () => {
    if (!data.transferUserId) return data.setError("select_new_owner");
    data.setBusy(true);
    data.setError(null);
    try {
      await api.changeMailboxOwnership(id, {
        mode: "private",
        target_owner_user_id: data.transferUserId,
      });
      push("/app/dashboard");
    } catch (err) {
      data.setError(apiMessage(err, "mailbox_transfer_failed"));
      data.setBusy(false);
    }
  }, [data, id, push]);
}

async function runBusy(data: AccountData, action: () => Promise<void>) {
  data.setBusy(true);
  data.setError(null);
  data.setNotice(null);
  try {
    await action();
  } catch (err) {
    data.setError(apiMessage(err, "mailbox_update_failed"));
  } finally {
    data.setBusy(false);
  }
}

function apiMessage(error: unknown, fallback: string) {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}
