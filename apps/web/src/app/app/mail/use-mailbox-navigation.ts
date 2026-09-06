"use client";

import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type {
  EmailAccount,
  MailboxMetadata,
  UnifiedInbox,
} from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";

export type MailboxInitialTarget = {
  account: string | null;
  folder: string | null;
};

export function useMailboxNavigation(initial: MailboxInitialTarget) {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountFilter, setAccountFilter] = useState(initial.account || "all");
  const [folder, setFolder] = useState<string | null>(initial.folder);
  const [inbox, setInbox] = useState<UnifiedInbox | null>(null);
  const [metadata, setMetadata] = useState<MailboxMetadata | null>(null);
  const [moveFolder, setMoveFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const value = await api.unifiedInbox({
        accountId: selectedAccountId,
        folder: selectedAccountId ? folder : null,
        limit: 60,
      });
      setInbox(value);
    } catch (err) {
      setError(apiErrorMessage(err, t("mail.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [folder, selectedAccountId, t]);

  useEffect(() => {
    api
      .listAccounts()
      .then(setAccounts)
      .catch((err) => setError(apiErrorMessage(err, t("mail.mailboxesFailed"))));
  }, [t]);

  useEffect(() => {
    if (!selectedAccountId) {
      setMetadata(null);
      setFolder(null);
      setMoveFolder("");
      return;
    }
    void loadMetadata(selectedAccountId, setMetadata, setFolder, setMoveFolder, setError, t("mail.metadataFailed"));
  }, [selectedAccountId, t]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  const ensureMetadata = useCallback(
    async (accountId: string) => {
      if (metadata && selectedAccountId === accountId) return metadata;
      const value = await api.mailboxMetadata(accountId);
      setMetadata(value);
      setMoveFolder(archiveFolder(value));
      return value;
    },
    [metadata, selectedAccountId],
  );

  function changeAccount(id: string) {
    setFolder(null);
    setAccountFilter(id);
  }

  return {
    accounts,
    accountFilter,
    changeAccount,
    selectedAccountId,
    folder,
    setFolder,
    inbox,
    setInbox,
    metadata,
    moveFolder,
    setMoveFolder,
    loading,
    error,
    setError,
    selectableFolders,
    unreadByAccount,
    loadInbox,
    ensureMetadata,
  };
}

async function loadMetadata(
  accountId: string,
  setMetadata: (value: MailboxMetadata) => void,
  setFolder: React.Dispatch<React.SetStateAction<string | null>>,
  setMoveFolder: (value: string) => void,
  setError: (value: string) => void,
  fallback: string,
) {
  try {
    const value = await api.mailboxMetadata(accountId);
    setMetadata(value);
    const inboxFolder = value.folders.find((item) => item.role === "inbox")?.name;
    setFolder((current) => current ?? inboxFolder ?? null);
    setMoveFolder(archiveFolder(value));
  } catch (err) {
    setError(apiErrorMessage(err, fallback));
  }
}

function archiveFolder(metadata: MailboxMetadata): string {
  return metadata.folders.find((item) => item.role === "archive")?.name ?? "";
}

function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}
