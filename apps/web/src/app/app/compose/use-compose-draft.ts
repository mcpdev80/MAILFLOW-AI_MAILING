"use client";

import { ApiError, api } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";
import type { EditorMode, EmailAccount, MailDraft } from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTOSAVE_MS,
  joinRecipients,
  normalizeMessageType,
  splitRecipients,
} from "./compose-utils";

export type SaveState = "idle" | "saving" | "saved" | "failed";
export type ComposerFields = ReturnType<typeof fieldsFromDraft>;

type SetError = (value: string | null) => void;
type Translate = (key: TranslationKey) => string;

export function useComposeDraft(setError: SetError, t: Translate) {
  const searchParams = useSearchParams();
  const translateRef = useRef(t);
  const draftRef = useRef<MailDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [draft, setDraft] = useState<MailDraft | null>(null);
  const [fields, setFields] = useState(emptyFields);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  useEffect(() => {
    translateRef.current = t;
  }, [t]);
  const applyDraft = useCallback(
    (value: MailDraft) => applyDraftState(value, draftRef, setDraft, setFields),
    [],
  );
  useComposerInitialization(
    searchParams,
    applyDraft,
    setAccounts,
    setLoading,
    setError,
    translateRef,
  );
  const persist = useDraftPersist(
    draftRef,
    fields,
    setDraft,
    setSaveState,
    setError,
    t,
  );
  useDraftAutosave(draftRef, persist);
  return {
    loading,
    accounts,
    draft,
    setDraft,
    fields,
    setFields,
    saveState,
    draftRef,
    applyDraft,
    persist,
  };
}

function useComposerInitialization(
  params: ReturnType<typeof useSearchParams>,
  applyDraft: (draft: MailDraft) => void,
  setAccounts: (accounts: EmailAccount[]) => void,
  setLoading: (value: boolean) => void,
  setError: SetError,
  translateRef: React.RefObject<Translate>,
) {
  useEffect(() => {
    let cancelled = false;
    const openFailed = translateRef.current("compose.openFailed");
    void initializeComposer(
      params,
      applyDraft,
      setAccounts,
      setError,
      setLoading,
      () => cancelled,
      openFailed,
    );
    return () => {
      cancelled = true;
    };
  }, [applyDraft, params, setAccounts, setError, setLoading, translateRef]);
}

function useDraftPersist(
  draftRef: React.RefObject<MailDraft | null>,
  fields: ComposerFields,
  setDraft: (draft: MailDraft) => void,
  setSaveState: (state: SaveState) => void,
  setError: SetError,
  t: Translate,
) {
  return useCallback(async () => {
    const current = draftRef.current;
    if (!current || current.status === "sent" || current.status === "discarded")
      return;
    setSaveState("saving");
    try {
      const updated = await api.updateDraft(
        current.id,
        payloadFromFields(fields),
      );
      draftRef.current = updated;
      setDraft(updated);
      setSaveState("saved");
    } catch (err) {
      setSaveState("failed");
      setError(apiMessage(err, t("compose.saveFailed")));
    }
  }, [draftRef, fields, setDraft, setError, setSaveState, t]);
}

function useDraftAutosave(
  draftRef: React.RefObject<MailDraft | null>,
  persist: () => Promise<void>,
) {
  useEffect(() => {
    if (!draftRef.current) return;
    const timer = setTimeout(() => void persist(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [draftRef, persist]);
}

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

async function createDraftFromParams(
  accounts: EmailAccount[],
  params: ReturnType<typeof useSearchParams>,
) {
  const requestedAccount = params.get("account");
  const selected =
    accounts.find((item) => item.id === requestedAccount) ?? accounts[0];
  return api.createDraft({
    account_id: selected.id,
    message_type: normalizeMessageType(params.get("type")),
    to_recipients: splitRecipients(params.get("to") ?? ""),
    subject: params.get("subject") ?? "",
    in_reply_to: params.get("inReplyTo"),
    references: params.getAll("reference"),
  });
}

function applyDraftState(
  value: MailDraft,
  draftRef: React.RefObject<MailDraft | null>,
  setDraft: (draft: MailDraft) => void,
  setFields: React.Dispatch<React.SetStateAction<ComposerFields>>,
) {
  draftRef.current = value;
  setDraft(value);
  setFields(fieldsFromDraft(value));
}

function fieldsFromDraft(value: MailDraft) {
  return {
    accountId: value.account_id,
    to: joinRecipients(value.to_recipients),
    cc: joinRecipients(value.cc_recipients),
    bcc: joinRecipients(value.bcc_recipients),
    showCcBcc:
      value.cc_recipients.length > 0 || value.bcc_recipients.length > 0,
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
    body_html:
      fields.editorMode === "rich_text" ? fields.bodyHtml || null : null,
    editor_mode: fields.editorMode,
  };
}

const emptyFields = {
  accountId: "",
  to: "",
  cc: "",
  bcc: "",
  showCcBcc: false,
  subject: "",
  bodyText: "",
  bodyHtml: "",
  editorMode: "rich_text" as EditorMode,
};

function apiMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : fallback;
}
