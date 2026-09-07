"use client";

import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { EmailAccount, MailboxFolderView, MailboxMetadata, UnifiedInbox } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadUnifiedFolder } from "./mail-data-api";

export type MailboxInitialTarget = {
  account: string | null;
  folder: string | null;
};

const UNIFIED_FOLDERS: MailboxFolderView[] = [
  { name: "__role__:inbox", role: "inbox", selectable: true },
  { name: "__role__:sent", role: "sent", selectable: true },
  { name: "__role__:drafts", role: "drafts", selectable: true },
  { name: "__role__:trash", role: "trash", selectable: true },
  { name: "__role__:spam", role: "spam", selectable: true },
  { name: "__role__:archive", role: "archive", selectable: true },
];

const STANDARD_ROLE_ORDER = new Map([
  ["inbox", 0],
  ["sent", 1],
  ["sentitems", 1],
  ["sentmail", 1],
  ["drafts", 2],
  ["draft", 2],
  ["trash", 3],
  ["deleted", 3],
  ["deleteditems", 3],
  ["spam", 4],
  ["junk", 4],
  ["archive", 5],
]);

function normalizedRole(role: string | null): string {
  return (role ?? "").replace(/[_-]/g, "").toLowerCase();
}

export function standardFolderRank(folder: MailboxFolderView): number | null {
  return STANDARD_ROLE_ORDER.get(normalizedRole(folder.role)) ?? null;
}

function sortFolders(folders: MailboxFolderView[]): MailboxFolderView[] {
  return [...folders].sort((a, b) => {
    const ar = standardFolderRank(a);
    const br = standardFolderRank(b);
    if (ar != null && br != null) return ar - br;
    if (ar != null) return -1;
    if (br != null) return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function useMailboxNavigation(initial: MailboxInitialTarget) {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountFilter, setAccountFilter] = useState(initial.account || "all");
  const [folder, setFolder] = useState<string | null>(
    initial.folder || (initial.account ? null : "__role__:inbox"),
  );
  const [inbox, setInbox] = useState<UnifiedInbox | null>(null);
  const [metadata, setMetadata] = useState<MailboxMetadata | null>(null);
  const [moveFolder, setMoveFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedAccountId = accountFilter === "all" ? null : accountFilter;
  const selectableFolders = useMemo(
    () => selectedAccountId
      ? sortFolders(metadata?.folders.filter((item) => item.selectable) ?? [])
      : UNIFIED_FOLDERS,
    [metadata, selectedAccountId],
  );
  const unreadByAccount = useMemo(
    () =>
      new Map(
        (inbox?.counters ?? []).map((item) => [item.account_id, item.unread]),
      ),
    [inbox],
  );

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const value = selectedAccountId
        ? await api.unifiedInbox({
            accountId: selectedAccountId,
            folder,
            limit: 60,
          })
        : await loadUnifiedFolder((folder ?? "__role__:inbox").replace("__role__:", ""), 60);
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
      .catch((err) =>
        setError(apiErrorMessage(err, t("mail.mailboxesFailed"))),
      );
  }, [t]);

  useEffect(() => {
    if (!selectedAccountId) {
      setMetadata(null);
      setFolder((current) => current?.startsWith("__role__:") ? current : "__role__:inbox");
      setMoveFolder("");
      return;
    }
    void loadMetadata(
      selectedAccountId,
      setMetadata,
      setFolder,
      setMoveFolder,
      setError,
      t("mail.metadataFailed"),
    );
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
    setFolder(id === "all" ? "__role__:inbox" : null);
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
    const inboxFolder = value.folders.find(
      (item) => normalizedRole(item.role) === "inbox",
    )?.name;
    setFolder((current) =>
      current && !current.startsWith("__role__:") ? current : inboxFolder ?? null,
    );
    setMoveFolder(archiveFolder(value));
  } catch (err) {
    setError(apiErrorMessage(err, fallback));
  }
}

function archiveFolder(metadata: MailboxMetadata): string {
  return metadata.folders.find((item) => normalizedRole(item.role) === "archive")?.name ?? "";
}

function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}
