"use client";

import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type {
  DraftAttachment,
  EditorMode,
  EmailAccount,
  MailDraft,
  WritingAction,
  WritingPreview,
  WritingScope,
} from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTOSAVE_MS,
  MAX_ATTACHMENT_BYTES,
  fileToBase64,
  joinRecipients,
  normalizeMessageType,
  splitRecipients,
  textToHtml,
} from "./compose-utils";

export function useComposePage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const draftRef = useRef<MailDraft | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [draft, setDraft] = useState<MailDraft | null>(null);
  const [fields, setFields] = useState(emptyFields);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [ai, setAi] = useState(initialAiState);

  const applyDraft = useCallback((value: MailDraft) => {
    draftRef.current = value;
    setDraft(value);
    setFields(fieldsFromDraft(value));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void initializeComposer(
      searchParams,
      applyDraft,
      setAccounts,
      setError,
      setLoading,
      () => cancelled,
      t("compose.openFailed"),
    );
    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [applyDraft, searchParams, t]);

  const persist = useCallback(async () => {
    const current = draftRef.current;
    if (!current || current.status === "sent" || current.status === "discarded") return;
    setSaveState("saving");
    try {
      const updated = await api.updateDraft(current.id, payloadFromFields(fields));
      draftRef.current = updated;
      setDraft(updated);
      setSaveState("saved");
    } catch (err) {
      setSaveState("failed");
      setError(apiMessage(err, t("compose.saveFailed")));
    }
  }, [fields, t]);

  useEffect(() => {
    if (!draftRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void persist(), AUTOSAVE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [persist]);

  const runAI = useCallback(async (selectedText: string) => {
    const current = draftRef.current;
    if (!current || !validateAI(ai, selectedText, setError, t)) return;
    setAi((state) => ({ ...state, loading: true, preview: null }));
    setError(null);
    try {
      await persist();
      const preview = await api.previewWriting(current.id, aiPayload(ai, selectedText));
      setAi((state) => ({ ...state, loading: false, preview, selectedSource: selectedText }));
    } catch (err) {
      setAi((state) => ({ ...state, loading: false }));
      setError(apiMessage(err, t("compose.aiFailed")));
    }
  }, [ai, persist, t]);

  const applyAIPreview = useCallback(() => {
    if (!ai.preview) return;
    const next = applyPreviewText(fields.bodyText, ai.preview, ai.selectedSource);
    setFields((current) => ({
      ...current,
      bodyText: next,
      bodyHtml: current.editorMode === "rich_text" ? textToHtml(next) : current.bodyHtml,
    }));
    setAi((state) => ({ ...state, preview: null, selectedSource: "" }));
    setNotice(t("compose.aiApplied"));
  }, [ai.preview, ai.selectedSource, fields.bodyText, t]);

  const addAttachments = useCallback(async (files: File[]) => {
    const current = draftRef.current;
    if (!current || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of files) await uploadAttachment(current.id, file, t("compose.attachmentTooLarge"));
      applyDraft(await api.getDraft(current.id));
    } catch (err) {
      setError(apiMessage(err, t("compose.attachmentFailed")));
    } finally {
      setUploading(false);
    }
  }, [applyDraft, t]);

  const removeAttachment = useCallback(async (attachment: DraftAttachment) => {
    const current = draftRef.current;
    if (!current) return;
    try {
      await api.removeDraftAttachment(current.id, attachment.id);
      applyDraft(await api.getDraft(current.id));
    } catch (err) {
      setError(apiMessage(err, t("compose.removeAttachmentFailed")));
    }
  }, [applyDraft, t]);

  const send = useCallback(async () => {
    const current = draftRef.current;
    if (!current) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      await persist();
      const check = await api.preSendCheck(current.id);
      setWarnings(check.warning_codes);
      if (!check.can_send) return setError(t("compose.missingRecipient"));
      if (!confirmMissingAttachment(check.warning_codes, t)) return;
      const result = await api.sendDraft(current.id);
      applyDraft(await api.getDraft(current.id));
      setNotice(result.message_id ? `${t("compose.sent")} (${result.message_id})` : t("compose.sent"));
    } catch (err) {
      setError(apiMessage(err, t("compose.sendFailed")));
      await refreshAfterFailure(current.id, applyDraft);
    } finally {
      setSending(false);
    }
  }, [applyDraft, persist, t]);

  const discard = useCallback(async () => {
    const current = draftRef.current;
    if (!current || !window.confirm(t("compose.discardConfirm"))) return;
    try {
      await api.discardDraft(current.id);
      draftRef.current = null;
      setDraft(null);
      setNotice(t("compose.discarded"));
    } catch (err) {
      setError(apiMessage(err, t("compose.saveFailed")));
    }
  }, [t]);

  return {
    loading, accounts, draft, fields, saveState, sending, uploading, error, notice, warnings, ai,
    setFields, setAi, persist, runAI, applyAIPreview, addAttachments, removeAttachment, send, discard,
  };
}

export type ComposeController = ReturnType<typeof useComposePage>;
type SaveState = "idle" | "saving" | "saved" | "failed";
type ComposerFields = ReturnType<typeof fieldsFromDraft>;
type SetError = (value: string | null) => void;
type Translate = ReturnType<typeof useI18n>["t"];

const emptyFields = {
  accountId: "", to: "", cc: "", bcc: "", showCcBcc: false,
  subject: "", bodyText: "", bodyHtml: "", editorMode: "rich_text" as EditorMode,
};
const initialAiState = {
  action: "improve" as WritingAction,
  scope: "full" as WritingScope,
  instruction: "", language: "", loading: false,
  preview: null as WritingPreview | null, selectedSource: "",
};

async function initializeComposer(
  params: ReturnType<typeof useSearchParams>,
  applyDraft: (draft: MailDraft) => void,
  setAccounts: (accounts: EmailAccount[]) => void,
  setError: SetError,
  setLoading: (loading: boolean) => void,
  isCancelled: () => boolean,
  openFailed: string,
) {
  try {
    const accounts = await api.listAccounts();
    if (isCancelled()) return;
    setAccounts(accounts);
    if (accounts.length === 0) return;
    const requestedDraft = params.get("draft");
    const draft = requestedDraft
      ? await api.getDraft(requestedDraft)
      : await createDraftFromParams(accounts, params);
    if (!isCancelled()) applyDraft(draft);
  } catch (err) {
    if (!isCancelled()) setError(apiMessage(err, openFailed));
  } finally {
    if (!isCancelled()) setLoading(false);
  }
}

async function createDraftFromParams(accounts: EmailAccount[], params: ReturnType<typeof useSearchParams>) {
  const requestedAccount = params.get("account");
  const selected = accounts.find((item) => item.id === requestedAccount) ?? accounts[0];
  return api.createDraft({
    account_id: selected.id,
    message_type: normalizeMessageType(params.get("type")),
    to_recipients: splitRecipients(params.get("to") ?? ""),
    subject: params.get("subject") ?? "",
    in_reply_to: params.get("inReplyTo"),
    references: params.getAll("reference"),
  });
}

function fieldsFromDraft(value: MailDraft) {
  return {
    accountId: value.account_id,
    to: joinRecipients(value.to_recipients),
    cc: joinRecipients(value.cc_recipients),
    bcc: joinRecipients(value.bcc_recipients),
    showCcBcc: value.cc_recipients.length > 0 || value.bcc_recipients.length > 0,
    subject: value.subject,
    bodyText: value.body_text,
    bodyHtml: value.body_html ?? "",
    editorMode: value.editor_mode,
  };
}

function payloadFromFields(fields: ComposerFields) {
  return {
    account_id: fields.accountId,
    to_recipients: splitRecipients(fields.to),
    cc_recipients: splitRecipients(fields.cc),
    bcc_recipients: splitRecipients(fields.bcc),
    subject: fields.subject,
    body_text: fields.bodyText,
    body_html: fields.editorMode === "rich_text" ? fields.bodyHtml || null : null,
    editor_mode: fields.editorMode,
  };
}

function validateAI(ai: typeof initialAiState, selectedText: string, setError: SetError, t: Translate) {
  if (ai.scope === "selection" && !selectedText) {
    setError(t("compose.selectText"));
    return false;
  }
  if (ai.action === "translate" && !ai.language.trim()) {
    setError(t("compose.chooseLanguage"));
    return false;
  }
  if (ai.action === "custom" && !ai.instruction.trim()) {
    setError(t("compose.enterInstruction"));
    return false;
  }
  return true;
}

function aiPayload(ai: typeof initialAiState, selectedText: string) {
  return {
    action: ai.action,
    scope: ai.scope,
    selected_text: selectedText || null,
    instruction: ai.instruction.trim() || null,
    target_language: ai.language.trim() || null,
  };
}

function applyPreviewText(body: string, preview: WritingPreview, selectedSource: string) {
  if (preview.scope !== "selection" || !selectedSource) return preview.text;
  const index = body.indexOf(selectedSource);
  if (index < 0) return preview.text;
  return `${body.slice(0, index)}${preview.text}${body.slice(index + selectedSource.length)}`;
}

async function uploadAttachment(draftId: string, file: File, tooLargeMessage: string) {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name}: ${tooLargeMessage}`);
  await api.addDraftAttachment(draftId, {
    filename: file.name,
    content_type: file.type || "application/octet-stream",
    content_base64: await fileToBase64(file),
  });
}

function confirmMissingAttachment(warnings: string[], t: Translate) {
  if (!warnings.includes("attachment_mentioned_but_missing")) return true;
  return window.confirm(t("compose.missingAttachmentConfirm"));
}

async function refreshAfterFailure(id: string, applyDraft: (draft: MailDraft) => void) {
  try {
    applyDraft(await api.getDraft(id));
  } catch {
    // Keep local draft state when refreshing the failed send state also fails.
  }
}

function apiMessage(error: unknown, fallback: string) {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}
