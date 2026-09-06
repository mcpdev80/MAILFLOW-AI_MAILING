"use client";

import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { useComposeAi } from "./use-compose-ai";
import { useComposeAttachments } from "./use-compose-attachments";
import { useComposeDelivery } from "./use-compose-delivery";
import { useComposeDraft } from "./use-compose-draft";

export function useComposePage() {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const draft = useComposeDraft(setError, t);
  const ai = useComposeAi({
    draftRef: draft.draftRef,
    fields: draft.fields,
    setFields: draft.setFields,
    persist: draft.persist,
    setError,
    setNotice,
    t,
  });
  const attachments = useComposeAttachments({
    draftRef: draft.draftRef,
    applyDraft: draft.applyDraft,
    setError,
    t,
  });
  const delivery = useComposeDelivery({
    draftRef: draft.draftRef,
    persist: draft.persist,
    applyDraft: draft.applyDraft,
    setDraft: draft.setDraft,
    setError,
    setNotice,
    t,
  });
  return {
    loading: draft.loading,
    accounts: draft.accounts,
    draft: draft.draft,
    fields: draft.fields,
    saveState: draft.saveState,
    sending: delivery.sending,
    uploading: attachments.uploading,
    error,
    notice,
    warnings: delivery.warnings,
    ai: ai.ai,
    setFields: draft.setFields,
    setAi: ai.setAi,
    persist: draft.persist,
    runAI: ai.runAI,
    applyAIPreview: ai.applyAIPreview,
    addAttachments: attachments.addAttachments,
    removeAttachment: attachments.removeAttachment,
    send: delivery.send,
    discard: delivery.discard,
  };
}

export type ComposeController = ReturnType<typeof useComposePage>;
