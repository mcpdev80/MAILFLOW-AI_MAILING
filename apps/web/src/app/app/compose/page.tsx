"use client";

import { ApiError, api } from "@/lib/api";
import type {
  DraftAttachment,
  EditorMode,
  EmailAccount,
  MailDraft,
  MessageType,
} from "@/lib/types";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const AUTOSAVE_MS = 900;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function splitRecipients(value: string): string[] {
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinRecipients(values: string[]): string {
  return values.join(", ");
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.slice(value.indexOf(",") + 1) : value);
    };
    reader.readAsDataURL(file);
  });
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ComposePage() {
  const searchParams = useSearchParams();
  const richEditorRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<MailDraft | null>(null);

  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [draft, setDraft] = useState<MailDraft | null>(null);
  const [accountId, setAccountId] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("rich_text");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const applyDraft = useCallback((value: MailDraft) => {
    draftRef.current = value;
    setDraft(value);
    setAccountId(value.account_id);
    setTo(joinRecipients(value.to_recipients));
    setCc(joinRecipients(value.cc_recipients));
    setBcc(joinRecipients(value.bcc_recipients));
    setShowCcBcc(value.cc_recipients.length > 0 || value.bcc_recipients.length > 0);
    setSubject(value.subject);
    setBodyText(value.body_text);
    setBodyHtml(value.body_html ?? "");
    setEditorMode(value.editor_mode);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      setError(null);
      try {
        const visibleAccounts = await api.listAccounts();
        if (cancelled) return;
        setAccounts(visibleAccounts);
        if (visibleAccounts.length === 0) return;

        const requestedDraft = searchParams.get("draft");
        if (requestedDraft) {
          const existing = await api.getDraft(requestedDraft);
          if (!cancelled) applyDraft(existing);
          return;
        }

        const requestedAccount = searchParams.get("account");
        const selected =
          visibleAccounts.find((item) => item.id === requestedAccount) ??
          visibleAccounts[0];
        const messageType = (searchParams.get("type") ?? "new") as MessageType;
        const created = await api.createDraft({
          account_id: selected.id,
          message_type: ["new", "reply", "reply_all", "forward"].includes(messageType)
            ? messageType
            : "new",
          to_recipients: splitRecipients(searchParams.get("to") ?? ""),
          subject: searchParams.get("subject") ?? "",
          in_reply_to: searchParams.get("inReplyTo"),
          references: searchParams.getAll("reference"),
        });
        if (!cancelled) applyDraft(created);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not open composer");
        }
      }
    }
    initialize();
    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [applyDraft, searchParams]);

  const persist = useCallback(async () => {
    const current = draftRef.current;
    if (!current || current.status === "sent" || current.status === "discarded") return;
    setSaveState("saving");
    try {
      const updated = await api.updateDraft(current.id, {
        account_id: accountId,
        to_recipients: splitRecipients(to),
        cc_recipients: splitRecipients(cc),
        bcc_recipients: splitRecipients(bcc),
        subject,
        body_text: bodyText,
        body_html: editorMode === "rich_text" ? bodyHtml || null : null,
        editor_mode: editorMode,
      });
      draftRef.current = updated;
      setDraft(updated);
      setSaveState("saved");
    } catch (err) {
      setSaveState("failed");
      setError(err instanceof ApiError ? err.message : "Draft save failed");
    }
  }, [accountId, bcc, bodyHtml, bodyText, cc, editorMode, subject, to]);

  useEffect(() => {
    if (!draftRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      persist();
    }, AUTOSAVE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [persist]);

  useEffect(() => {
    const editor = richEditorRef.current;
    if (editor && editorMode === "rich_text" && editor.innerHTML !== bodyHtml) {
      editor.innerHTML = bodyHtml;
    }
  }, [bodyHtml, editorMode]);

  function richInput() {
    const editor = richEditorRef.current;
    if (!editor) return;
    setBodyHtml(editor.innerHTML);
    setBodyText(editor.innerText);
  }

  function format(command: "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList") {
    richEditorRef.current?.focus();
    document.execCommand(command);
    richInput();
  }

  async function addAttachment(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!draftRef.current || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error(`${file.name} is larger than 10 MB`);
        }
        const content = await fileToBase64(file);
        await api.addDraftAttachment(draftRef.current.id, {
          filename: file.name,
          content_type: file.type || "application/octet-stream",
          content_base64: content,
        });
      }
      applyDraft(await api.getDraft(draftRef.current.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Attachment upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(attachment: DraftAttachment) {
    if (!draftRef.current) return;
    try {
      await api.removeDraftAttachment(draftRef.current.id, attachment.id);
      applyDraft(await api.getDraft(draftRef.current.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove attachment");
    }
  }

  async function send() {
    const current = draftRef.current;
    if (!current) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      await persist();
      const check = await api.preSendCheck(current.id);
      setWarnings(check.warning_codes);
      if (!check.can_send) {
        setError("Please add at least one recipient before sending.");
        return;
      }
      if (check.warning_codes.includes("attachment_mentioned_but_missing")) {
        const proceed = window.confirm(
          "Your message mentions an attachment, but no file is attached. Send anyway?",
        );
        if (!proceed) return;
      }
      const result = await api.sendDraft(current.id);
      const refreshed = await api.getDraft(current.id);
      applyDraft(refreshed);
      setNotice(`Message sent${result.message_id ? ` (${result.message_id})` : ""}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sending failed");
      if (draftRef.current) {
        try {
          applyDraft(await api.getDraft(draftRef.current.id));
        } catch {
          // Keep the local draft visible if refreshing the failed state also fails.
        }
      }
    } finally {
      setSending(false);
    }
  }

  async function discard() {
    if (!draftRef.current) return;
    if (!window.confirm("Discard this draft?")) return;
    try {
      await api.discardDraft(draftRef.current.id);
      setNotice("Draft discarded.");
      setDraft(null);
      draftRef.current = null;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not discard draft");
    }
  }

  if (accounts.length === 0 && !error) {
    return (
      <main className="container">
        <h1>Compose</h1>
        <div className="card empty">
          <p>Connect a mailbox before composing a message.</p>
          <Link className="btn" href="/onboarding">
            Connect mailbox
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container" style={{ maxWidth: "960px" }}>
      <div className="composeHeader">
        <div>
          <h1 style={{ marginBottom: "0.2rem" }}>
            {draft?.message_type === "reply"
              ? "Reply"
              : draft?.message_type === "reply_all"
                ? "Reply all"
                : draft?.message_type === "forward"
                  ? "Forward"
                  : "New message"}
          </h1>
          <span className="muted" style={{ fontSize: "0.82rem" }}>
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Draft saved"
                : saveState === "failed"
                  ? "Draft save failed"
                  : "Draft"}
          </span>
        </div>
        <Link className="btn secondary" href="/app/dashboard">
          Close
        </Link>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}
      {warnings.includes("attachment_mentioned_but_missing") && (
        <div className="alert">You mention an attachment, but none is attached.</div>
      )}

      {draft && (
        <section className="card composeCard">
          <label className="composeField">
            <span>From</span>
            <select
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              disabled={draft.status === "sent"}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.username}{account.ownership_mode === "shared" ? " · shared" : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="composeField recipientField">
            <span>To</span>
            <input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="name@example.com"
              disabled={draft.status === "sent"}
            />
            {!showCcBcc && (
              <button type="button" className="textButton" onClick={() => setShowCcBcc(true)}>
                CC / BCC
              </button>
            )}
          </div>

          {showCcBcc && (
            <>
              <label className="composeField">
                <span>CC</span>
                <input value={cc} onChange={(event) => setCc(event.target.value)} disabled={draft.status === "sent"} />
              </label>
              <label className="composeField">
                <span>BCC</span>
                <input value={bcc} onChange={(event) => setBcc(event.target.value)} disabled={draft.status === "sent"} />
              </label>
            </>
          )}

          <label className="composeField">
            <span>Subject</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              disabled={draft.status === "sent"}
            />
          </label>

          <div className="editorModeRow">
            <div className="segmented" aria-label="Editor mode">
              <button
                type="button"
                className={editorMode === "rich_text" ? "active" : ""}
                onClick={() => setEditorMode("rich_text")}
                disabled={draft.status === "sent"}
              >
                Rich text
              </button>
              <button
                type="button"
                className={editorMode === "markdown" ? "active" : ""}
                onClick={() => setEditorMode("markdown")}
                disabled={draft.status === "sent"}
              >
                Markdown
              </button>
            </div>
          </div>

          {editorMode === "rich_text" ? (
            <div className="editorShell">
              <div className="editorToolbar" aria-label="Formatting">
                <button type="button" onClick={() => format("bold")} title="Bold"><strong>B</strong></button>
                <button type="button" onClick={() => format("italic")} title="Italic"><em>I</em></button>
                <button type="button" onClick={() => format("underline")} title="Underline"><u>U</u></button>
                <button type="button" onClick={() => format("insertUnorderedList")} title="Bullet list">• List</button>
                <button type="button" onClick={() => format("insertOrderedList")} title="Numbered list">1. List</button>
              </div>
              <div
                ref={richEditorRef}
                className="richEditor"
                contentEditable={draft.status !== "sent"}
                suppressContentEditableWarning
                onInput={richInput}
                aria-label="Message body"
              />
            </div>
          ) : (
            <textarea
              className="markdownEditor"
              value={bodyText}
              onChange={(event) => setBodyText(event.target.value)}
              placeholder="Write Markdown…"
              disabled={draft.status === "sent"}
            />
          )}

          <div className="attachmentSection">
            {draft.attachments.map((attachment) => (
              <div className="attachmentChip" key={attachment.id}>
                <span>▧</span>
                <span>{attachment.filename}</span>
                <span className="muted">{formatBytes(attachment.size_bytes)}</span>
                {draft.status !== "sent" && (
                  <button type="button" className="textButton" onClick={() => removeAttachment(attachment)} aria-label={`Remove ${attachment.filename}`}>
                    ×
                  </button>
                )}
              </div>
            ))}
            {draft.status !== "sent" && (
              <label className="btn secondary attachmentButton">
                {uploading ? "Adding…" : "Attach files"}
                <input type="file" multiple hidden disabled={uploading} onChange={addAttachment} />
              </label>
            )}
          </div>

          <div className="composeFooter">
            <div className="composeFooterActions">
              {draft.status !== "sent" && (
                <button type="button" className="btn" onClick={send} disabled={sending || uploading}>
                  {sending ? "Sending…" : draft.status === "failed" ? "Retry send" : "Send"}
                </button>
              )}
              {draft.status !== "sent" && (
                <button type="button" className="btn secondary" onClick={persist} disabled={saveState === "saving"}>
                  Save draft
                </button>
              )}
            </div>
            {draft.status !== "sent" && (
              <button type="button" className="textButton dangerText" onClick={discard}>
                Discard
              </button>
            )}
            {draft.status === "sent" && <span className="pill ok">Sent</span>}
          </div>

          {draft.last_error && <div className="alert error">Last send error: {draft.last_error}</div>}
        </section>
      )}

      <style jsx>{`
        .composeHeader { display:flex; justify-content:space-between; align-items:center; gap:1rem; margin-bottom:1rem; }
        .composeCard { padding:0; overflow:hidden; }
        .composeField { display:grid; grid-template-columns:72px 1fr; align-items:center; min-height:48px; padding:0 1rem; border-bottom:1px solid var(--border); gap:.75rem; }
        .composeField > span { color:var(--muted); font-size:.85rem; }
        .composeField input, .composeField select { width:100%; border:0; background:transparent; color:inherit; outline:none; padding:.65rem 0; font:inherit; }
        .recipientField { grid-template-columns:72px 1fr auto; }
        .textButton { border:0; background:transparent; color:var(--muted); cursor:pointer; padding:.35rem; }
        .textButton:hover { color:inherit; }
        .dangerText:hover { color:#dc2626; }
        .editorModeRow { padding:.75rem 1rem; display:flex; justify-content:flex-end; }
        .segmented { display:inline-flex; border:1px solid var(--border); border-radius:8px; padding:2px; }
        .segmented button { border:0; background:transparent; color:var(--muted); padding:.35rem .65rem; border-radius:6px; cursor:pointer; }
        .segmented button.active { background:var(--surface-2, rgba(127,127,127,.12)); color:inherit; }
        .editorShell { border-top:1px solid var(--border); border-bottom:1px solid var(--border); }
        .editorToolbar { min-height:42px; display:flex; align-items:center; gap:.25rem; padding:.35rem 1rem; border-bottom:1px solid var(--border); }
        .editorToolbar button { min-width:32px; border:0; border-radius:6px; padding:.35rem .5rem; background:transparent; color:inherit; cursor:pointer; }
        .editorToolbar button:hover { background:var(--surface-2, rgba(127,127,127,.12)); }
        .richEditor, .markdownEditor { box-sizing:border-box; width:100%; min-height:300px; padding:1.1rem; border:0; outline:none; background:transparent; color:inherit; font:inherit; line-height:1.55; resize:vertical; }
        .markdownEditor { font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; border-top:1px solid var(--border); border-bottom:1px solid var(--border); }
        .attachmentSection { display:flex; flex-wrap:wrap; align-items:center; gap:.5rem; padding:.8rem 1rem; }
        .attachmentChip { display:flex; align-items:center; gap:.4rem; border:1px solid var(--border); border-radius:8px; padding:.4rem .55rem; font-size:.85rem; }
        .attachmentButton { cursor:pointer; }
        .composeFooter { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:1rem; border-top:1px solid var(--border); }
        .composeFooterActions { display:flex; gap:.5rem; }
        @media (max-width: 640px) {
          .composeField { grid-template-columns:52px 1fr; }
          .recipientField { grid-template-columns:52px 1fr auto; }
          .composeFooter { align-items:flex-start; flex-direction:column; }
          .richEditor, .markdownEditor { min-height:240px; }
        }
      `}</style>
    </main>
  );
}
