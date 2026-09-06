"use client";

import { type TranslationKey, useI18n } from "@/lib/i18n";
import type {
  EditorMode,
  MessageType,
  WritingAction,
  WritingScope,
} from "@/lib/types";
import Link from "next/link";
import { type ChangeEvent, useEffect, useRef } from "react";
import { AI_ACTIONS, formatBytes } from "./compose-utils";
import type { ComposeController } from "./use-compose-page";

export function ComposeUi({ controller }: { controller: ComposeController }) {
  const { t } = useI18n();
  if (controller.loading)
    return (
      <main className="container">
        <div className="card muted">{t("common.loading")}</div>
      </main>
    );
  if (controller.accounts.length === 0 && !controller.error)
    return <NoMailbox />;
  return (
    <main className="container" style={{ maxWidth: 960, margin: "0 auto" }}>
      <ComposeHeader
        type={controller.draft?.message_type ?? "new"}
        saveState={controller.saveState}
      />
      {controller.error && (
        <div className="alert error">{controller.error}</div>
      )}
      {controller.notice && <div className="alert ok">{controller.notice}</div>}
      {controller.warnings.includes("attachment_mentioned_but_missing") && (
        <div className="alert">{t("compose.missingAttachment")}</div>
      )}
      {controller.draft && <ComposeCard controller={controller} />}
    </main>
  );
}

function NoMailbox() {
  const { t } = useI18n();
  return (
    <main className="container">
      <h1>{t("compose.title")}</h1>
      <div className="card empty">
        <p>{t("compose.noMailbox")}</p>
        <Link className="btn" href="/onboarding">
          {t("compose.connectMailbox")}
        </Link>
      </div>
    </main>
  );
}

function ComposeHeader({
  type,
  saveState,
}: { type: MessageType; saveState: ComposeController["saveState"] }) {
  const { t } = useI18n();
  const titles: Record<MessageType, TranslationKey> = {
    new: "compose.new",
    reply: "compose.reply",
    reply_all: "compose.replyAll",
    forward: "compose.forward",
  };
  const status: Record<ComposeController["saveState"], TranslationKey> = {
    idle: "compose.draft",
    saving: "compose.saving",
    saved: "compose.saved",
    failed: "compose.saveFailed",
  };
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        marginBottom: 16,
      }}
    >
      <div>
        <h1 style={{ marginBottom: 4 }}>{t(titles[type])}</h1>
        <span className="muted">{t(status[saveState])}</span>
      </div>
      <Link className="btn secondary" href="/app/dashboard">
        {t("compose.close")}
      </Link>
    </header>
  );
}

function ComposeCard({ controller }: { controller: ComposeController }) {
  const sent = controller.draft?.status === "sent";
  return (
    <section className="card" style={{ padding: 0, overflow: "hidden" }}>
      <AddressFields controller={controller} disabled={sent} />
      {!sent && <AiBar controller={controller} />}
      {controller.ai.preview && <AiPreview controller={controller} />}
      <MessageEditor controller={controller} disabled={sent} />
      <Attachments controller={controller} disabled={sent} />
      <ComposeFooter controller={controller} sent={sent} />
      {controller.draft?.last_error && (
        <LastSendError value={controller.draft.last_error} />
      )}
    </section>
  );
}

function AddressFields({
  controller,
  disabled,
}: { controller: ComposeController; disabled: boolean }) {
  const { t } = useI18n();
  const patch = (value: Partial<ComposeController["fields"]>) =>
    controller.setFields((current) => ({ ...current, ...value }));
  return (
    <div style={{ display: "grid", gap: 0 }}>
      <FieldRow label={t("compose.from")}>
        <select
          value={controller.fields.accountId}
          disabled={disabled}
          onChange={(e) => patch({ accountId: e.target.value })}
        >
          {controller.accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.username}
            </option>
          ))}
        </select>
      </FieldRow>
      <FieldRow
        label={t("compose.to")}
        trailing={
          !controller.fields.showCcBcc ? (
            <button
              className="textButton"
              type="button"
              onClick={() => patch({ showCcBcc: true })}
            >
              {t("compose.ccBcc")}
            </button>
          ) : undefined
        }
      >
        <input
          value={controller.fields.to}
          disabled={disabled}
          placeholder="name@example.com"
          onChange={(e) => patch({ to: e.target.value })}
        />
      </FieldRow>
      {controller.fields.showCcBcc && (
        <FieldRow label="CC">
          <input
            value={controller.fields.cc}
            disabled={disabled}
            onChange={(e) => patch({ cc: e.target.value })}
          />
        </FieldRow>
      )}
      {controller.fields.showCcBcc && (
        <FieldRow label="BCC">
          <input
            value={controller.fields.bcc}
            disabled={disabled}
            onChange={(e) => patch({ bcc: e.target.value })}
          />
        </FieldRow>
      )}
      <FieldRow label={t("compose.subject")}>
        <input
          value={controller.fields.subject}
          disabled={disabled}
          onChange={(e) => patch({ subject: e.target.value })}
        />
      </FieldRow>
    </div>
  );
}

function FieldRow({
  label,
  children,
  trailing,
}: { label: string; children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <label
      style={{
        display: "grid",
        gridTemplateColumns: "72px minmax(0, 1fr) auto",
        alignItems: "center",
        gap: 12,
        minHeight: 48,
        padding: "0 16px",
        borderBottom: "1px solid var(--mf-border)",
      }}
    >
      <span className="muted">{label}</span>
      <span style={{ minWidth: 0 }}>{children}</span>
      {trailing}
    </label>
  );
}

function AiBar({ controller }: { controller: ComposeController }) {
  const { t } = useI18n();
  const patch = (value: Partial<ComposeController["ai"]>) =>
    controller.setAi((current) => ({ ...current, ...value }));
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        padding: 12,
        borderBottom: "1px solid var(--mf-border)",
      }}
    >
      <strong>AI</strong>
      <select
        aria-label={t("compose.aiAction")}
        value={controller.ai.action}
        onChange={(e) => patch({ action: e.target.value as WritingAction })}
      >
        {AI_ACTIONS.map((action) => (
          <option key={action} value={action}>
            {t(`compose.action.${action}` as TranslationKey)}
          </option>
        ))}
      </select>
      <select
        aria-label={t("compose.aiScope")}
        value={controller.ai.scope}
        onChange={(e) => patch({ scope: e.target.value as WritingScope })}
      >
        <option value="full">{t("compose.fullDraft")}</option>
        <option value="selection">{t("compose.selection")}</option>
      </select>
      {controller.ai.action === "translate" && (
        <input
          aria-label={t("compose.targetLanguage")}
          placeholder={t("compose.targetLanguage")}
          value={controller.ai.language}
          onChange={(e) => patch({ language: e.target.value })}
        />
      )}
      {controller.ai.action === "custom" && (
        <input
          aria-label={t("compose.customInstruction")}
          placeholder={t("compose.customInstruction")}
          value={controller.ai.instruction}
          onChange={(e) => patch({ instruction: e.target.value })}
        />
      )}
      <AiRunButton controller={controller} />
    </div>
  );
}

function AiRunButton({ controller }: { controller: ComposeController }) {
  const { t } = useI18n();
  return (
    <button
      className="btn secondary"
      type="button"
      disabled={controller.ai.loading}
      onClick={() => void controller.runAI(selectedEditorText())}
    >
      {controller.ai.loading ? t("compose.generating") : t("compose.preview")}
    </button>
  );
}

function AiPreview({ controller }: { controller: ComposeController }) {
  const { t } = useI18n();
  const preview = controller.ai.preview;
  if (!preview) return null;
  return (
    <section
      style={{ padding: 16, borderBottom: "1px solid var(--mf-border)" }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <strong>{t("compose.aiSuggestion")}</strong>
        <span className="muted">
          {preview.used_thread_context || preview.used_current_message
            ? t("compose.threadContext")
            : t("compose.draftContext")}
        </span>
      </div>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          font: "inherit",
          border: "1px solid var(--mf-border)",
          borderRadius: 8,
          padding: 12,
        }}
      >
        {preview.text}
      </pre>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn"
          type="button"
          onClick={controller.applyAIPreview}
        >
          {t("compose.applySuggestion")}
        </button>
        <button
          className="btn secondary"
          type="button"
          onClick={() =>
            controller.setAi((current) => ({ ...current, preview: null }))
          }
        >
          {t("compose.discardSuggestion")}
        </button>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>
        {t("compose.aiSafety")}
      </p>
    </section>
  );
}

function MessageEditor({
  controller,
  disabled,
}: { controller: ComposeController; disabled: boolean }) {
  const { t } = useI18n();
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (
      controller.fields.editorMode === "rich_text" &&
      editorRef.current &&
      editorRef.current.innerHTML !== controller.fields.bodyHtml
    )
      editorRef.current.innerHTML = controller.fields.bodyHtml;
  }, [controller.fields.bodyHtml, controller.fields.editorMode]);
  const patch = (value: Partial<ComposeController["fields"]>) =>
    controller.setFields((current) => ({ ...current, ...value }));
  return (
    <section>
      <EditorMode
        value={controller.fields.editorMode}
        disabled={disabled}
        onChange={(editorMode) => patch({ editorMode })}
      />
      {controller.fields.editorMode === "rich_text" ? (
        <RichEditor
          editorRef={editorRef}
          disabled={disabled}
          onInput={(bodyHtml, bodyText) => patch({ bodyHtml, bodyText })}
        />
      ) : (
        <textarea
          data-compose-editor="true"
          aria-label={t("compose.messageBody")}
          value={controller.fields.bodyText}
          disabled={disabled}
          placeholder={t("compose.writeMarkdown")}
          onChange={(e) => patch({ bodyText: e.target.value })}
          style={{
            boxSizing: "border-box",
            width: "100%",
            minHeight: 300,
            padding: 18,
            border: 0,
            background: "transparent",
            color: "inherit",
            resize: "vertical",
          }}
        />
      )}
    </section>
  );
}

function EditorMode({
  value,
  disabled,
  onChange,
}: {
  value: EditorMode;
  disabled: boolean;
  onChange: (value: EditorMode) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        gap: 6,
        padding: 12,
      }}
    >
      <button
        className={value === "rich_text" ? "btn" : "btn secondary"}
        type="button"
        disabled={disabled}
        onClick={() => onChange("rich_text")}
      >
        {t("compose.richText")}
      </button>
      <button
        className={value === "markdown" ? "btn" : "btn secondary"}
        type="button"
        disabled={disabled}
        onClick={() => onChange("markdown")}
      >
        {t("compose.markdown")}
      </button>
    </div>
  );
}

function RichEditor({
  editorRef,
  disabled,
  onInput,
}: {
  editorRef: React.RefObject<HTMLDivElement | null>;
  disabled: boolean;
  onInput: (html: string, text: string) => void;
}) {
  const { t } = useI18n();
  function format(command: string) {
    editorRef.current?.focus();
    document.execCommand(command);
    if (editorRef.current)
      onInput(editorRef.current.innerHTML, editorRef.current.innerText);
  }
  return (
    <div style={{ borderTop: "1px solid var(--mf-border)" }}>
      <div
        aria-label={t("compose.formatting")}
        style={{
          display: "flex",
          gap: 4,
          padding: "8px 16px",
          borderBottom: "1px solid var(--mf-border)",
        }}
      >
        <button type="button" onClick={() => format("bold")}>
          <strong>B</strong>
        </button>
        <button type="button" onClick={() => format("italic")}>
          <em>I</em>
        </button>
        <button type="button" onClick={() => format("underline")}>
          <u>U</u>
        </button>
        <button type="button" onClick={() => format("insertUnorderedList")}>
          •
        </button>
        <button type="button" onClick={() => format("insertOrderedList")}>
          1.
        </button>
      </div>
      <div
        ref={editorRef}
        data-compose-editor="true"
        contentEditable={!disabled}
        suppressContentEditableWarning
        aria-label={t("compose.messageBody")}
        onInput={() =>
          editorRef.current &&
          onInput(editorRef.current.innerHTML, editorRef.current.innerText)
        }
        style={{ minHeight: 300, padding: 18, outline: "none" }}
      />
    </div>
  );
}

function Attachments({
  controller,
  disabled,
}: { controller: ComposeController; disabled: boolean }) {
  const { t } = useI18n();
  function add(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void controller.addAttachments(files);
  }
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        padding: 16,
        borderTop: "1px solid var(--mf-border)",
      }}
    >
      {controller.draft?.attachments.map((attachment) => (
        <span className="pill" key={attachment.id}>
          {attachment.filename} · {formatBytes(attachment.size_bytes)}{" "}
          {!disabled && (
            <button
              className="textButton"
              type="button"
              onClick={() => void controller.removeAttachment(attachment)}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <label className="btn secondary" style={{ cursor: "pointer" }}>
          {controller.uploading ? t("compose.adding") : t("compose.attach")}
          <input
            type="file"
            multiple
            hidden
            disabled={controller.uploading}
            onChange={add}
          />
        </label>
      )}
    </div>
  );
}

function ComposeFooter({
  controller,
  sent,
}: { controller: ComposeController; sent: boolean }) {
  const { t } = useI18n();
  return (
    <footer
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: 16,
        borderTop: "1px solid var(--mf-border)",
      }}
    >
      <div style={{ display: "flex", gap: 8 }}>
        {!sent && (
          <button
            className="btn"
            type="button"
            disabled={controller.sending || controller.uploading}
            onClick={() => void controller.send()}
          >
            {controller.sending
              ? t("compose.sending")
              : controller.draft?.status === "failed"
                ? t("compose.retrySend")
                : t("compose.send")}
          </button>
        )}
        {!sent && (
          <button
            className="btn secondary"
            type="button"
            disabled={controller.saveState === "saving"}
            onClick={() => void controller.persist()}
          >
            {t("compose.saveDraft")}
          </button>
        )}
      </div>
      {!sent ? (
        <button
          className="btn danger"
          type="button"
          onClick={() => void controller.discard()}
        >
          {t("compose.discard")}
        </button>
      ) : (
        <span className="pill ok">{t("compose.sent")}</span>
      )}
    </footer>
  );
}

function LastSendError({ value }: { value: string }) {
  const { t } = useI18n();
  return (
    <div className="alert error" style={{ margin: 16 }}>
      {t("compose.lastSendError")}: {value}
    </div>
  );
}

function selectedEditorText(): string {
  const active = document.activeElement;
  if (
    active instanceof HTMLTextAreaElement &&
    active.dataset.composeEditor === "true"
  )
    return active.value
      .slice(active.selectionStart, active.selectionEnd)
      .trim();
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return "";
  const range = selection.getRangeAt(0);
  const editor =
    range.commonAncestorContainer.parentElement?.closest?.(
      '[data-compose-editor="true"]',
    ) ??
    (range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer.closest('[data-compose-editor="true"]')
      : null);
  return editor ? selection.toString().trim() : "";
}
