"use client";

import {
  type ContextMenuPosition,
  MailContextMenu,
} from "@/components/mail-context-menu";
import { ApiError, api, mailAttachmentUrl } from "@/lib/api";
import type { MailActionId } from "@/lib/mail-actions";
import type {
  EmailAccount,
  InboxMessage,
  MailActionRequest,
  MailboxMetadata,
  MessageDetail,
  ThreadView,
  UnifiedInbox,
} from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

function displayDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { day: "2-digit", month: "short" });
}

function bytes(value: number | null): string {
  if (value == null) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function subjectWithPrefix(subject: string, prefix: "Re:" | "Fwd:"): string {
  const cleaned = subject.trim();
  if (prefix === "Re:" && /^re:/i.test(cleaned)) return cleaned;
  if (prefix === "Fwd:" && /^(fwd?|wg):/i.test(cleaned)) return cleaned;
  return `${prefix} ${cleaned}`.trim();
}

function messageKey(
  message: Pick<InboxMessage, "account_id" | "folder" | "uid">,
): string {
  return `${message.account_id}:${message.folder}:${message.uid}`;
}

function safeRecipients(values: string[], ownAddress: string): string[] {
  const own = ownAddress.trim().toLowerCase();
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    for (const item of raw.split(",")) {
      const value = item.trim();
      if (!value) continue;
      const normalized = value.toLowerCase();
      if (normalized === own || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(value);
    }
  }
  return result;
}

export default function MailPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [folder, setFolder] = useState<string | null>(null);
  const [inbox, setInbox] = useState<UnifiedInbox | null>(null);
  const [metadata, setMetadata] = useState<MailboxMetadata | null>(null);
  const [selected, setSelected] = useState<MessageDetail | null>(null);
  const [thread, setThread] = useState<ThreadView | null>(null);
  const [moveFolder, setMoveFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [messageLoading, setMessageLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    position: ContextMenuPosition;
    message: InboxMessage;
  } | null>(null);
  const [aiResult, setAiResult] = useState<{
    title: string;
    body: string;
  } | null>(null);

  const selectedAccountId = accountFilter === "all" ? null : accountFilter;

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const value = await api.unifiedInbox({
        accountId: selectedAccountId,
        folder: selectedAccountId ? folder : null,
        limit: 60,
      });
      setInbox(value);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load mail");
    } finally {
      setLoading(false);
    }
  }, [folder, selectedAccountId]);

  useEffect(() => {
    api
      .listAccounts()
      .then(setAccounts)
      .catch((err) =>
        setError(
          err instanceof ApiError ? err.message : "Could not load mailboxes",
        ),
      );
  }, []);

  useEffect(() => {
    setSelected(null);
    setThread(null);
    if (!selectedAccountId) {
      setMetadata(null);
      setFolder(null);
      setMoveFolder("");
      return;
    }
    api
      .mailboxMetadata(selectedAccountId)
      .then((value) => {
        setMetadata(value);
        const inboxFolder = value.folders.find(
          (item) => item.role === "inbox",
        )?.name;
        setFolder((current) => current ?? inboxFolder ?? null);
        setMoveFolder(
          value.folders.find((item) => item.role === "archive")?.name ?? "",
        );
      })
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load mailbox metadata",
        ),
      );
  }, [selectedAccountId]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const unreadByAccount = useMemo(
    () =>
      new Map(
        (inbox?.counters ?? []).map((item) => [item.account_id, item.unread]),
      ),
    [inbox],
  );

  async function ensureMetadata(accountId: string): Promise<MailboxMetadata> {
    if (metadata && selectedAccountId === accountId) return metadata;
    const value = await api.mailboxMetadata(accountId);
    setMetadata(value);
    setMoveFolder(
      value.folders.find((item) => item.role === "archive")?.name ?? "",
    );
    return value;
  }

  async function openMessage(message: InboxMessage) {
    setMessageLoading(true);
    setError(null);
    try {
      const [detail, meta] = await Promise.all([
        api.messageDetail(message.account_id, message.folder, message.uid),
        ensureMetadata(message.account_id),
      ]);
      let resolved = detail;
      if (!detail.seen && meta.capabilities.read_state) {
        await api.mailAction(detail.account_id, detail.folder, detail.uid, {
          action: "mark_read",
        });
        resolved = { ...detail, seen: true };
        setInbox((current) =>
          current
            ? {
                ...current,
                total_unread: Math.max(0, current.total_unread - 1),
                messages: current.messages.map((item) =>
                  messageKey(item) === messageKey(detail)
                    ? { ...item, seen: true }
                    : item,
                ),
                counters: current.counters.map((item) =>
                  item.account_id === detail.account_id &&
                  item.folder === detail.folder
                    ? { ...item, unread: Math.max(0, item.unread - 1) }
                    : item,
                ),
              }
            : current,
        );
      }
      setSelected(resolved);
      if (resolved.thread_id) {
        setThread(
          await api.threadDetail(resolved.account_id, resolved.thread_id),
        );
      } else {
        setThread(null);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not open message",
      );
    } finally {
      setMessageLoading(false);
    }
  }

  async function detailFor(message: InboxMessage): Promise<MessageDetail> {
    if (selected && messageKey(selected) === messageKey(message))
      return selected;
    return api.messageDetail(message.account_id, message.folder, message.uid);
  }

  async function runActionFor(
    message: InboxMessage,
    payload: MailActionRequest,
  ) {
    if (
      payload.action === "trash" &&
      !window.confirm("Move this message to Trash?")
    )
      return;
    if (
      payload.action === "spam" &&
      !window.confirm("Move this message to Spam/Junk?")
    )
      return;
    setActionLoading(true);
    setError(null);
    try {
      await api.mailAction(
        message.account_id,
        message.folder,
        message.uid,
        payload,
      );
      if (selected && messageKey(selected) === messageKey(message)) {
        setSelected(null);
        setThread(null);
      }
      await loadInbox();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mail action failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function runAction(payload: MailActionRequest) {
    if (!selected) return;
    if (
      payload.action === "trash" &&
      !window.confirm("Move this message to Trash?")
    )
      return;
    if (
      payload.action === "spam" &&
      !window.confirm("Move this message to Spam/Junk?")
    )
      return;
    setActionLoading(true);
    setError(null);
    try {
      const result = await api.mailAction(
        selected.account_id,
        selected.folder,
        selected.uid,
        payload,
      );
      if (
        result.destination_folder &&
        result.destination_folder !== selected.folder
      ) {
        setSelected(null);
        setThread(null);
        await loadInbox();
        return;
      }
      const refreshed = await api.messageDetail(
        selected.account_id,
        selected.folder,
        selected.uid,
      );
      setSelected(refreshed);
      await loadInbox();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mail action failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function createReply(
    type: "reply" | "reply_all" | "forward",
    source: MessageDetail | null = selected,
    aiAction?: MailActionId,
  ) {
    if (!source) return;
    setActionLoading(true);
    setError(null);
    try {
      const references = Array.from(
        new Set([...source.references, source.message_id].filter(Boolean)),
      );
      const ownAddress = source.account_address;
      let toRecipients: string[] = [];
      let ccRecipients: string[] = [];
      let bodyText = "";
      if (type === "reply") {
        toRecipients = [source.from_email];
      } else if (type === "reply_all") {
        toRecipients = safeRecipients(
          [source.from_email, ...source.to_emails],
          ownAddress,
        );
        const toSet = new Set(toRecipients.map((item) => item.toLowerCase()));
        ccRecipients = safeRecipients(source.cc_emails, ownAddress).filter(
          (item) => !toSet.has(item.toLowerCase()),
        );
      } else {
        bodyText = [
          "",
          "---------- Forwarded message ----------",
          `From: ${source.from_email}`,
          `Date: ${source.date ?? ""}`,
          `Subject: ${source.subject}`,
          `To: ${source.to_emails.join(", ")}`,
          "",
          source.body_text,
        ].join("\n");
      }
      const draft = await api.createDraft({
        account_id: source.account_id,
        message_type: type,
        in_reply_to: type === "forward" ? null : source.message_id,
        references,
        to_recipients: toRecipients,
        cc_recipients: ccRecipients,
        subject: subjectWithPrefix(
          source.subject,
          type === "forward" ? "Fwd:" : "Re:",
        ),
        body_text: bodyText,
        editor_mode: "rich_text",
      });
      if (aiAction?.startsWith("ai_reply")) {
        const instructionByAction: Partial<Record<MailActionId, string>> = {
          ai_reply:
            "Write a helpful reply to the sender in the sender's language.",
          ai_reply_short: "Write a concise reply. Keep only what is necessary.",
          ai_reply_friendly: "Write a warm, friendly reply.",
          ai_reply_professional: "Write a professional, polished reply.",
          ai_reply_direct:
            "Write a direct, clear reply without unnecessary filler.",
        };
        let instruction = instructionByAction[aiAction] ?? "";
        if (aiAction === "ai_reply_custom") {
          instruction =
            window.prompt("How should AI write the reply?")?.trim() ?? "";
          if (!instruction) return;
        }
        const preview = await api.previewWriting(draft.id, {
          action: "custom",
          scope: "full",
          instruction,
        });
        await api.updateDraft(draft.id, {
          body_text: preview.content,
          body_html: null,
          editor_mode: "rich_text",
        });
      }
      router.push(`/app/compose?draft=${encodeURIComponent(draft.id)}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create reply draft",
      );
      setActionLoading(false);
    }
  }

  function showExistingInsight(action: MailActionId) {
    const insights = thread?.insights;
    if (!insights) {
      setAiResult({
        title: "AI insight",
        body: "No processed thread insight is available yet for this message.",
      });
      return;
    }
    if (action === "ai_summarize")
      setAiResult({ title: "Summary", body: insights.overview });
    else if (action === "ai_key_points")
      setAiResult({
        title: "Key points",
        body: insights.key_points.join("\n• ") || "No key points detected.",
      });
    else if (action === "ai_todos")
      setAiResult({
        title: "To-dos",
        body: insights.todos.join("\n• ") || "No to-dos detected.",
      });
    else if (action === "ai_questions")
      setAiResult({
        title: "Open questions",
        body:
          insights.open_questions.join("\n• ") || "No open questions detected.",
      });
    else if (action === "ai_deadlines")
      setAiResult({
        title: "Deadlines / dates",
        body: insights.deadline || "No deadline detected.",
      });
  }

  async function executeContextAction(
    action: MailActionId,
    message: InboxMessage,
  ) {
    if (action === "reply" || action === "reply_all" || action === "forward") {
      await createReply(action, await detailFor(message));
      return;
    }
    if (action.startsWith("ai_reply")) {
      await createReply("reply", await detailFor(message), action);
      return;
    }
    if (
      [
        "ai_summarize",
        "ai_key_points",
        "ai_todos",
        "ai_questions",
        "ai_deadlines",
      ].includes(action)
    ) {
      const detail = await detailFor(message);
      if (!selected || messageKey(selected) !== messageKey(detail))
        await openMessage(message);
      showExistingInsight(action);
      return;
    }
    if (action.startsWith("ai_translate_") || action === "ai_custom") {
      const detail = await detailFor(message);
      const language =
        action === "ai_translate_de"
          ? "German"
          : action === "ai_translate_en"
            ? "English"
            : action === "ai_translate_es"
              ? "Spanish"
              : "";
      const custom =
        language ||
        window
          .prompt(
            action === "ai_custom"
              ? "What should AI do with this message?"
              : "Translate to which language?",
          )
          ?.trim();
      if (!custom) return;
      const draft = await api.createDraft({
        account_id: detail.account_id,
        message_type: "new",
        subject: `AI: ${detail.subject}`,
        body_text: detail.body_text,
        editor_mode: "rich_text",
      });
      const preview = await api.previewWriting(draft.id, {
        action: language ? "translate" : "custom",
        scope: "full",
        target_language: language || undefined,
        instruction: language ? undefined : custom,
      });
      setAiResult({
        title: language ? `Translation · ${language}` : "AI result",
        body: preview.content,
      });
      await api.discardDraft(draft.id);
      return;
    }
    if (action === "mark_read")
      return runActionFor(message, { action: "mark_read" });
    if (action === "mark_unread")
      return runActionFor(message, { action: "mark_unread" });
    if (action === "flag") return runActionFor(message, { action: "flag" });
    if (action === "unflag") return runActionFor(message, { action: "unflag" });
    if (action === "archive")
      return runActionFor(message, { action: "archive" });
    if (action === "spam") return runActionFor(message, { action: "spam" });
    if (action === "trash") return runActionFor(message, { action: "trash" });
    if (action === "move") {
      const meta = await ensureMetadata(message.account_id);
      const names = meta.folders
        .filter((item) => item.selectable && item.name !== message.folder)
        .map((item) => item.name);
      const destination = window
        .prompt(`Move to folder:\n${names.join("\n")}`)
        ?.trim();
      if (destination && names.includes(destination))
        await runActionFor(message, {
          action: "move",
          destination_folder: destination,
        });
      return;
    }
    if (action === "print_message" || action === "print_thread") {
      const detail = await detailFor(message);
      const params = new URLSearchParams({
        account: detail.account_id,
        folder: detail.folder,
        uid: String(detail.uid),
        mode: action === "print_thread" ? "thread" : "message",
      });
      window.open(
        `/print/mail?${params.toString()}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    if (action === "message_details") {
      const detail = await detailFor(message);
      setAiResult({
        title: "Message details",
        body: [
          `Message-ID: ${detail.message_id}`,
          `From: ${detail.from_email}`,
          `To: ${detail.to_emails.join(", ")}`,
          `Folder: ${detail.folder}`,
          `UID: ${detail.uid}`,
        ].join("\n"),
      });
    }
  }

  function promptTag(action: "add_tags" | "remove_tags") {
    const value = window.prompt(
      action === "add_tags" ? "Tag to add" : "Tag to remove",
    );
    if (value?.trim()) runAction({ action, tags: [value.trim()] });
  }

  const visibleMessages = thread?.messages?.length
    ? thread.messages
    : selected
      ? [selected]
      : [];
  const capabilities = metadata?.capabilities;
  const selectableFolders =
    metadata?.folders.filter((item) => item.selectable) ?? [];

  return (
    <main className="mailApp">
      <header className="mailTopbar">
        <div className="brandGroup">
          <Link href="/app/dashboard" className="brandLink">
            Mailflow
          </Link>
          <span className="topTitle">Mail</span>
        </div>
        <div className="topActions">
          <span className="unreadBadge">{inbox?.total_unread ?? 0} unread</span>
          <Link href="/app/compose" className="btn">
            Compose
          </Link>
        </div>
      </header>

      {error && <div className="mailError">{error}</div>}

      <div className="workspace">
        <aside className="accountsPane">
          <button
            type="button"
            className={`accountItem ${accountFilter === "all" ? "active" : ""}`}
            onClick={() => setAccountFilter("all")}
          >
            <span>All mailboxes</span>
            <strong>{inbox?.total_unread ?? 0}</strong>
          </button>
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              className={`accountItem ${accountFilter === account.id ? "active" : ""}`}
              onClick={() => {
                setFolder(null);
                setAccountFilter(account.id);
              }}
            >
              <span className="accountLabel">
                <span>{account.username}</span>
                <small>{account.ownership_mode}</small>
              </span>
              <strong>{unreadByAccount.get(account.id) ?? 0}</strong>
            </button>
          ))}

          {selectedAccountId && metadata && (
            <div className="folderGroup">
              <div className="paneLabel">Folders</div>
              {selectableFolders.map((item) => (
                <button
                  type="button"
                  key={item.name}
                  className={`folderItem ${folder === item.name ? "active" : ""}`}
                  onClick={() => setFolder(item.name)}
                >
                  <span>{item.name}</span>
                  {item.role && <small>{item.role}</small>}
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="listPane">
          <div className="paneHeader">
            <div>
              <strong>{selectedAccountId ? "Mailbox" : "Unified inbox"}</strong>
              <span>{inbox?.messages.length ?? 0} loaded</span>
            </div>
            <button
              type="button"
              className="iconButton"
              onClick={loadInbox}
              title="Refresh"
            >
              ↻
            </button>
          </div>

          <div className="messageList">
            {loading && <div className="state">Loading mail…</div>}
            {!loading && inbox?.messages.length === 0 && (
              <div className="state">No messages in this view.</div>
            )}
            {!loading &&
              inbox?.messages.map((message) => (
                <button
                  type="button"
                  key={messageKey(message)}
                  className={`messageRow ${!message.seen ? "unread" : ""} ${selected && messageKey(selected) === messageKey(message) ? "selected" : ""}`}
                  onClick={() => openMessage(message)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({
                      position: {
                        x: Math.min(event.clientX, window.innerWidth - 210),
                        y: Math.min(event.clientY, window.innerHeight - 220),
                      },
                      message,
                    });
                  }}
                >
                  <span className="rowTop">
                    <span className="sender">{message.from_email}</span>
                    <span className="date">{displayDate(message.date)}</span>
                  </span>
                  <span className="subjectLine">
                    {message.flagged && <span title="Flagged">★</span>}
                    {message.subject || "(no subject)"}
                  </span>
                  <span className="rowMeta">
                    <span className="accountPill">
                      {message.account_address}
                    </span>
                    {message.attachments.length > 0 && (
                      <span>▧ {message.attachments.length}</span>
                    )}
                    {message.thread_id && <span>thread</span>}
                  </span>
                </button>
              ))}
          </div>
        </section>

        <section className="detailPane">
          {!selected && !messageLoading && (
            <div className="detailEmpty">
              <div className="emptyIcon">✉</div>
              <strong>Select a message</strong>
              <span>Open a message or conversation from the list.</span>
            </div>
          )}
          {messageLoading && <div className="state">Opening message…</div>}
          {selected && !messageLoading && (
            <>
              <div className="detailHeader">
                <div className="detailHeading">
                  <h1>{selected.subject || "(no subject)"}</h1>
                  <span className="accountPill">
                    {selected.account_address}
                  </span>
                </div>
                <div className="actionRow">
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => createReply("reply")}
                  >
                    Reply
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => createReply("reply_all")}
                  >
                    Reply all
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => createReply("forward")}
                  >
                    Forward
                  </button>
                </div>
                <div className="actionRow compactActions">
                  {capabilities?.read_state && (
                    <button
                      type="button"
                      onClick={() =>
                        runAction({
                          action: selected.seen ? "mark_unread" : "mark_read",
                        })
                      }
                      disabled={actionLoading}
                    >
                      {selected.seen ? "Mark unread" : "Mark read"}
                    </button>
                  )}
                  {capabilities?.flag && (
                    <button
                      type="button"
                      onClick={() =>
                        runAction({
                          action: selected.flagged ? "unflag" : "flag",
                        })
                      }
                      disabled={actionLoading}
                    >
                      {selected.flagged ? "Unflag" : "Flag"}
                    </button>
                  )}
                  {capabilities?.archive && (
                    <button
                      type="button"
                      onClick={() => runAction({ action: "archive" })}
                      disabled={actionLoading}
                    >
                      Archive
                    </button>
                  )}
                  {capabilities?.spam && (
                    <button
                      type="button"
                      onClick={() => runAction({ action: "spam" })}
                      disabled={actionLoading}
                    >
                      Spam
                    </button>
                  )}
                  {capabilities?.trash && (
                    <button
                      className="danger"
                      type="button"
                      onClick={() => runAction({ action: "trash" })}
                      disabled={actionLoading}
                    >
                      Trash
                    </button>
                  )}
                </div>
                {capabilities?.move && (
                  <div className="moveRow">
                    <select
                      value={moveFolder}
                      onChange={(event) => setMoveFolder(event.target.value)}
                    >
                      <option value="">Move to…</option>
                      {selectableFolders
                        .filter((item) => item.name !== selected.folder)
                        .map((item) => (
                          <option value={item.name} key={item.name}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={!moveFolder || actionLoading}
                      onClick={() =>
                        runAction({
                          action: "move",
                          destination_folder: moveFolder,
                        })
                      }
                    >
                      Move
                    </button>
                    {capabilities.tags && (
                      <>
                        <button
                          type="button"
                          onClick={() => promptTag("add_tags")}
                        >
                          + Tag
                        </button>
                        <button
                          type="button"
                          onClick={() => promptTag("remove_tags")}
                        >
                          − Tag
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {thread?.insights && (
                <article className="messageCard aiInsights">
                  <header className="messageCardHeader">
                    <div>
                      <strong>AI summary</strong>
                      <div className="recipientMeta">
                        Thread-aware · incrementally updated
                      </div>
                    </div>
                    {thread.insights.deadline && (
                      <span>Deadline: {thread.insights.deadline}</span>
                    )}
                  </header>
                  <p>{thread.insights.overview}</p>
                  {thread.insights.key_points.length > 0 && (
                    <section>
                      <strong>Key points</strong>
                      <ul>
                        {thread.insights.key_points.map((item) => (
                          <li key={`point-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {thread.insights.todos.length > 0 && (
                    <section>
                      <strong>To-dos</strong>
                      <ul>
                        {thread.insights.todos.map((item) => (
                          <li key={`todo-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {thread.insights.open_questions.length > 0 && (
                    <section>
                      <strong>Open questions</strong>
                      <ul>
                        {thread.insights.open_questions.map((item) => (
                          <li key={`question-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                </article>
              )}

              <div className="conversation">
                {visibleMessages.map((message) => (
                  <article className="messageCard" key={messageKey(message)}>
                    <header className="messageCardHeader">
                      <div>
                        <strong>{message.from_email}</strong>
                        <div className="recipientMeta">
                          To:{" "}
                          {message.to_emails.join(", ") ||
                            selected.account_address}
                          {message.cc_emails.length > 0 &&
                            ` · CC: ${message.cc_emails.join(", ")}`}
                        </div>
                      </div>
                      <span>{message.date ?? ""}</span>
                    </header>

                    {message.safe_html ? (
                      <iframe
                        className="mailBodyFrame"
                        sandbox=""
                        srcDoc={message.safe_html}
                        title={`Message from ${message.from_email}`}
                      />
                    ) : (
                      <pre className="plainBody">
                        {message.body_text || "(empty message)"}
                      </pre>
                    )}

                    {message.attachments.length > 0 && (
                      <div className="attachments">
                        {message.attachments.map((attachment) => (
                          <a
                            className="attachment"
                            key={attachment.part_id}
                            href={mailAttachmentUrl(
                              message.account_id,
                              message.folder,
                              message.uid,
                              attachment.part_id,
                            )}
                          >
                            <span>▧</span>
                            <span>{attachment.filename}</span>
                            <small>{bytes(attachment.size)}</small>
                          </a>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {contextMenu && (
        <MailContextMenu
          position={contextMenu.position}
          capabilities={metadata?.capabilities}
          seen={contextMenu.message.seen}
          flagged={contextMenu.message.flagged}
          onClose={() => setContextMenu(null)}
          onAction={(action) =>
            executeContextAction(action, contextMenu.message)
          }
        />
      )}

      {aiResult && (
        <div className="aiResultBackdrop" role="presentation">
          <dialog open className="aiResultDialog" aria-label={aiResult.title}>
            <header>
              <strong>{aiResult.title}</strong>
              <button
                type="button"
                onClick={() => setAiResult(null)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <pre>{aiResult.body}</pre>
          </dialog>
        </div>
      )}

      <style jsx>{`
        .mailApp { min-height:100vh; background:var(--bg); color:var(--fg); display:flex; flex-direction:column; }
        .mailTopbar { min-height:58px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; padding:0 1rem; gap:1rem; background:var(--surface, var(--bg)); }
        .brandGroup,.topActions,.actionRow,.moveRow { display:flex; align-items:center; gap:.55rem; }
        .brandLink { color:inherit; font-weight:750; text-decoration:none; }
        .topTitle { color:var(--muted); font-size:.9rem; }
        .unreadBadge,.accountPill { border:1px solid var(--border); border-radius:999px; padding:.2rem .48rem; font-size:.72rem; color:var(--muted); white-space:nowrap; }
        .mailError { padding:.65rem 1rem; background:#7f1d1d; color:white; font-size:.85rem; }
        .workspace { flex:1; min-height:0; display:grid; grid-template-columns:220px minmax(300px, 390px) minmax(0, 1fr); }
        .accountsPane,.listPane { border-right:1px solid var(--border); min-height:0; overflow:auto; }
        .accountsPane { padding:.65rem; }
        .accountItem,.folderItem,.messageRow { width:100%; border:0; text-align:left; color:inherit; cursor:pointer; }
        .accountItem { display:flex; align-items:center; justify-content:space-between; gap:.5rem; padding:.65rem .7rem; border-radius:8px; background:transparent; }
        .accountItem:hover,.accountItem.active,.folderItem:hover,.folderItem.active { background:var(--surface-2, rgba(127,127,127,.1)); }
        .accountLabel { min-width:0; display:flex; flex-direction:column; gap:.12rem; }
        .accountLabel > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .accountLabel small,.folderItem small { color:var(--muted); }
        .folderGroup { margin-top:1rem; padding-top:.7rem; border-top:1px solid var(--border); }
        .paneLabel { color:var(--muted); text-transform:uppercase; letter-spacing:.06em; font-size:.68rem; padding:.4rem .65rem; }
        .folderItem { display:flex; justify-content:space-between; gap:.5rem; padding:.5rem .65rem; border-radius:7px; background:transparent; }
        .listPane { display:flex; flex-direction:column; }
        .paneHeader { min-height:55px; padding:0 .8rem; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; }
        .paneHeader > div { display:flex; flex-direction:column; gap:.08rem; }
        .paneHeader span { font-size:.72rem; color:var(--muted); }
        .iconButton,.compactActions button,.moveRow button { border:1px solid var(--border); background:transparent; color:inherit; border-radius:7px; padding:.38rem .55rem; cursor:pointer; }
        .messageList { min-height:0; overflow:auto; }
        .messageRow { display:flex; flex-direction:column; gap:.3rem; padding:.78rem .9rem; border-bottom:1px solid var(--border); background:transparent; }
        .messageRow:hover,.messageRow.selected { background:var(--surface-2, rgba(127,127,127,.08)); }
        .messageRow.unread { background:color-mix(in srgb, var(--surface-2, #64748b) 12%, transparent); }
        .messageRow.unread .sender,.messageRow.unread .subjectLine { font-weight:750; }
        .rowTop,.rowMeta { display:flex; justify-content:space-between; align-items:center; gap:.5rem; }
        .sender,.subjectLine { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .sender { font-size:.85rem; }
        .date,.rowMeta { color:var(--muted); font-size:.69rem; }
        .subjectLine { display:flex; align-items:center; gap:.3rem; font-size:.82rem; }
        .rowMeta { justify-content:flex-start; }
        .detailPane { min-width:0; min-height:0; overflow:auto; display:flex; flex-direction:column; }
        .detailEmpty,.state { min-height:220px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.35rem; color:var(--muted); padding:1.5rem; text-align:center; }
        .emptyIcon { font-size:2rem; }
        .detailHeader { position:sticky; top:0; z-index:2; padding:.9rem 1rem; border-bottom:1px solid var(--border); background:var(--surface, var(--bg)); display:flex; flex-direction:column; gap:.65rem; }
        .detailHeading { display:flex; align-items:center; gap:.6rem; }
        .detailHeading h1 { margin:0; font-size:1.15rem; line-height:1.3; }
        .compactActions { flex-wrap:wrap; }
        .compactActions .danger { color:#dc2626; }
        .moveRow { flex-wrap:wrap; }
        .moveRow select { max-width:240px; min-height:34px; border:1px solid var(--border); border-radius:7px; background:transparent; color:inherit; padding:.3rem .45rem; }
        .conversation { padding:1rem; display:flex; flex-direction:column; gap:.8rem; }
        .messageCard { border:1px solid var(--border); border-radius:10px; overflow:hidden; background:var(--surface, transparent); }
        .messageCardHeader { display:flex; justify-content:space-between; gap:1rem; padding:.8rem 1rem; border-bottom:1px solid var(--border); font-size:.8rem; }
        .messageCardHeader > span,.recipientMeta { color:var(--muted); font-size:.72rem; }
        .recipientMeta { margin-top:.15rem; }
        .mailBody,.plainBody { padding:1rem; line-height:1.55; overflow-wrap:anywhere; }
        .mailBody :global(a) { color:var(--primary); }
        .plainBody { margin:0; white-space:pre-wrap; font:inherit; }
        .attachments { border-top:1px solid var(--border); padding:.7rem 1rem; display:flex; flex-wrap:wrap; gap:.5rem; }
        .attachment { display:flex; gap:.4rem; align-items:center; border:1px solid var(--border); border-radius:8px; padding:.42rem .55rem; color:inherit; text-decoration:none; font-size:.78rem; }
        .attachment small { color:var(--muted); }
        .aiResultBackdrop { position:fixed; inset:0; z-index:900; background:rgba(0,0,0,.36); display:grid; place-items:center; padding:1rem; }
        .aiResultDialog { width:min(680px,100%); max-height:80vh; overflow:auto; border:1px solid var(--border); border-radius:12px; background:var(--surface,var(--bg)); box-shadow:0 20px 60px rgba(0,0,0,.28); }
        .aiResultDialog header { display:flex; justify-content:space-between; align-items:center; padding:.8rem 1rem; border-bottom:1px solid var(--border); }
        .aiResultDialog header button { border:0; background:transparent; color:inherit; font-size:1.3rem; cursor:pointer; }
        .aiResultDialog pre { margin:0; padding:1rem; white-space:pre-wrap; font:inherit; line-height:1.55; }
        @media (max-width: 1000px) {
          .workspace { grid-template-columns:180px 320px minmax(0, 1fr); }
        }
        @media (max-width: 780px) {
          .workspace { display:block; }
          .accountsPane { border-right:0; border-bottom:1px solid var(--border); display:flex; overflow:auto; gap:.35rem; }
          .accountItem { width:auto; min-width:max-content; }
          .folderGroup { display:none; }
          .listPane { border-right:0; border-bottom:1px solid var(--border); max-height:45vh; }
          .detailPane { min-height:50vh; }
          .mailTopbar { position:sticky; top:0; z-index:4; }
        }
      `}</style>
    </main>
  );
}
