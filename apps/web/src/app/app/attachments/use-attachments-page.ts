"use client";

import {
  type AttachmentDetail,
  type AttachmentDocument,
  type AttachmentFolder,
  type BlockedAttachment,
  attachmentsApi,
} from "@/lib/attachments-api";
import { useCallback, useEffect, useState } from "react";

export type AttachmentView = "grid" | "list";

export function useAttachmentsPage() {
  const [documents, setDocuments] = useState<AttachmentDocument[]>([]);
  const [folders, setFolders] = useState<AttachmentFolder[]>([]);
  const [blocked, setBlocked] = useState<BlockedAttachment[]>([]);
  const [selected, setSelected] = useState<AttachmentDetail | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<string | null>(null);
  const [view, setView] = useState<AttachmentView>("grid");
  const [savedDecision, setSavedDecision] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextDocuments, nextFolders, nextBlocked] = await Promise.all([
        attachmentsApi.list({
          q: query.trim() || undefined,
          folderId,
          category,
          documentType,
        }),
        attachmentsApi.folders(),
        attachmentsApi.blocked(),
      ]);
      setDocuments(nextDocuments);
      setFolders(nextFolders);
      setBlocked(nextBlocked);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "request_failed");
    } finally {
      setLoading(false);
    }
  }, [category, documentType, folderId, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!savedDecision) return;
    const timer = window.setTimeout(() => setSavedDecision(false), 3200);
    return () => window.clearTimeout(timer);
  }, [savedDecision]);

  const openDocument = async (id: string) => {
    try {
      setError(null);
      setSelected(await attachmentsApi.detail(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "request_failed");
    }
  };

  const createFolder = async (name: string, parentId?: string | null) => {
    await attachmentsApi.createFolder(name, parentId);
    await load();
  };

  const renameFolder = async (id: string, name: string) => {
    await attachmentsApi.updateFolder(id, { name });
    await load();
  };

  const deleteFolder = async (id: string) => {
    await attachmentsApi.deleteFolder(id);
    if (folderId === id) setFolderId(null);
    await load();
  };

  const moveDocument = async (
    id: string,
    nextFolderId: string | null,
    remember: boolean,
  ) => {
    const updated = await attachmentsApi.correct(id, {
      folder_id: nextFolderId,
      remember,
    });
    setSelected(updated);
    if (remember) setSavedDecision(true);
    await load();
  };

  return {
    documents,
    folders,
    blocked,
    selected,
    folderId,
    query,
    category,
    documentType,
    view,
    savedDecision,
    loading,
    error,
    setFolderId,
    setQuery,
    setCategory,
    setDocumentType,
    setView,
    setSelected,
    openDocument,
    createFolder,
    renameFolder,
    deleteFolder,
    moveDocument,
  };
}
