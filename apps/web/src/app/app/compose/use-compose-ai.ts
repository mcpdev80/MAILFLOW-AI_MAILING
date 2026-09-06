"use client";

import { ApiError, api } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";
import type { MailDraft, WritingAction, WritingPreview, WritingScope } from "@/lib/types";
import { useCallback, useState } from "react";
import { textToHtml } from "./compose-utils";
import type { ComposerFields } from "./use-compose-draft";

type Translate = (key: TranslationKey) => string;
type Setter = (value: string | null) => void;

export function useComposeAi(options: {
  draftRef: React.RefObject<MailDraft | null>;
  fields: ComposerFields;
  setFields: React.Dispatch<React.SetStateAction<ComposerFields>>;
  persist: () => Promise<void>;
  setError: Setter;
  setNotice: Setter;
  t: Translate;
}) {
  const [ai, setAi] = useState(initialAiState);
  const runAI = useRunAi(ai, setAi, options);
  const applyAIPreview = useCallback(() => applyPreview(ai, setAi, options), [ai, options]);
  return { ai, setAi, runAI, applyAIPreview };
}

function useRunAi(
  ai: typeof initialAiState,
  setAi: React.Dispatch<React.SetStateAction<typeof initialAiState>>,
  options: Parameters<typeof useComposeAi>[0],
) {
  return useCallback(async (selectedText: string) => {
    const current = options.draftRef.current;
    if (!current || !validateAI(ai, selectedText, options.setError, options.t)) return;
    setAi((state) => ({ ...state, loading: true, preview: null }));
    options.setError(null);
    try {
      await options.persist();
      const preview = await api.previewWriting(current.id, aiPayload(ai, selectedText));
      setAi((state) => ({ ...state, loading: false, preview, selectedSource: selectedText }));
    } catch (err) {
      setAi((state) => ({ ...state, loading: false }));
      options.setError(apiMessage(err, options.t("compose.aiFailed")));
    }
  }, [ai, options, setAi]);
}

function applyPreview(
  ai: typeof initialAiState,
  setAi: React.Dispatch<React.SetStateAction<typeof initialAiState>>,
  options: Parameters<typeof useComposeAi>[0],
) {
  if (!ai.preview) return;
  const next = applyPreviewText(options.fields.bodyText, ai.preview, ai.selectedSource);
  options.setFields((current) => ({
    ...current,
    bodyText: next,
    bodyHtml: current.editorMode === "rich_text" ? textToHtml(next) : current.bodyHtml,
  }));
  setAi((state) => ({ ...state, preview: null, selectedSource: "" }));
  options.setNotice(options.t("compose.aiApplied"));
}

function validateAI(ai: typeof initialAiState, selectedText: string, setError: Setter, t: Translate) {
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

const initialAiState = {
  action: "improve" as WritingAction,
  scope: "full" as WritingScope,
  instruction: "",
  language: "",
  loading: false,
  preview: null as WritingPreview | null,
  selectedSource: "",
};

function apiMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}
