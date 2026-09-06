"use client";

import { ApiError, api } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";
import type { DraftAttachment, MailDraft } from "@/lib/types";
import { useCallback, useState } from "react";
import { fileToBase64, MAX_ATTACHMENT_BYTES } from "./compose-utils";

type Translate = (key: TranslationKey) => string;
type SetError = (value: string | null) => void;

export function useComposeAttachments(options: {
  draftRef: React.RefObject<MailDraft | null>;
  applyDraft: (draft: MailDraft) => void;
  setError: SetError;
  t: Translate;
}) {
  const [uploading, setUploading] = useState(false);
  const addAttachments = useCallback((files: File[]) => addFiles(files, options, setUploading), [options]);
  const removeAttachment = useCallback((attachment: DraftAttachment) => removeFile(attachment, options), [options]);
  return { uploading, addAttachments, removeAttachment };
}

async function addFiles(
  files: File[],
  options: Parameters<typeof useComposeAttachments>[0],
  setUploading: (value: boolean) => void,
) {
  const current = options.draftRef.current;
  if (!current || files.length === 0) return;
  setUploading(true);
  options.setError(null);
  try {
    for (const file of files) await uploadAttachment(current.id, file, options.t("compose.attachmentTooLarge"));
    options.applyDraft(await api.getDraft(current.id));
  } catch (err) {
    options.setError(apiMessage(err, options.t("compose.attachmentFailed")));
  } finally {
    setUploading(false);
  }
}

async function removeFile(
  attachment: DraftAttachment,
  options: Parameters<typeof useComposeAttachments>[0],
) {
  const current = options.draftRef.current;
  if (!current) return;
  try {
    await api.removeDraftAttachment(current.id, attachment.id);
    options.applyDraft(await api.getDraft(current.id));
  } catch (err) {
    options.setError(apiMessage(err, options.t("compose.removeAttachmentFailed")));
  }
}

async function uploadAttachment(draftId: string, file: File, tooLargeMessage: string) {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name}: ${tooLargeMessage}`);
  await api.addDraftAttachment(draftId, {
    filename: file.name,
    content_type: file.type || "application/octet-stream",
    content_base64: await fileToBase64(file),
  });
}

function apiMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}
