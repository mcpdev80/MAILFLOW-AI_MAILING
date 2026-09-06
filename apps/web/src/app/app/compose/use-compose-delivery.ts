"use client";

import { ApiError, api } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";
import type { MailDraft } from "@/lib/types";
import { useCallback, useState } from "react";

type Translate = (key: TranslationKey) => string;
type Setter = (value: string | null) => void;

type DeliveryOptions = {
  draftRef: React.RefObject<MailDraft | null>;
  persist: () => Promise<void>;
  applyDraft: (draft: MailDraft) => void;
  setDraft: (draft: MailDraft | null) => void;
  setError: Setter;
  setNotice: Setter;
  t: Translate;
};

export function useComposeDelivery(options: DeliveryOptions) {
  const [sending, setSending] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const send = useCallback(
    () => sendDraft(options, setSending, setWarnings),
    [options],
  );
  const discard = useCallback(() => discardDraft(options), [options]);
  return { sending, warnings, send, discard };
}

async function sendDraft(
  options: DeliveryOptions,
  setSending: (value: boolean) => void,
  setWarnings: (warnings: string[]) => void,
) {
  const current = options.draftRef.current;
  if (!current) return;
  setSending(true);
  options.setError(null);
  options.setNotice(null);
  try {
    await options.persist();
    const check = await api.preSendCheck(current.id);
    setWarnings(check.warning_codes);
    if (!check.can_send)
      return options.setError(options.t("compose.missingRecipient"));
    if (!confirmMissingAttachment(check.warning_codes, options.t)) return;
    const result = await api.sendDraft(current.id);
    options.applyDraft(await api.getDraft(current.id));
    options.setNotice(
      result.message_id
        ? `${options.t("compose.sent")} (${result.message_id})`
        : options.t("compose.sent"),
    );
  } catch (err) {
    options.setError(apiMessage(err, options.t("compose.sendFailed")));
    await refreshAfterFailure(current.id, options.applyDraft);
  } finally {
    setSending(false);
  }
}

async function discardDraft(options: DeliveryOptions) {
  const current = options.draftRef.current;
  if (!current || !window.confirm(options.t("compose.discardConfirm"))) return;
  try {
    await api.discardDraft(current.id);
    options.draftRef.current = null;
    options.setDraft(null);
    options.setNotice(options.t("compose.discarded"));
  } catch (err) {
    options.setError(apiMessage(err, options.t("compose.saveFailed")));
  }
}

function confirmMissingAttachment(warnings: string[], t: Translate): boolean {
  if (!warnings.includes("attachment_mentioned_but_missing")) return true;
  return window.confirm(t("compose.missingAttachmentConfirm"));
}

async function refreshAfterFailure(
  id: string,
  applyDraft: (draft: MailDraft) => void,
) {
  try {
    applyDraft(await api.getDraft(id));
  } catch {
    // Keep local draft state when refreshing the failed send state also fails.
  }
}

function apiMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : fallback;
}
