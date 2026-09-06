"use client";

import { useI18n } from "@/lib/i18n";
import type { InboxMessage } from "@/lib/types";
import { useMemo, useState } from "react";
import { displayMailDate, messageKey } from "./mail-workspace-utils";
import styles from "./mail-workspace.module.css";
import type { useMailWorkspace } from "./use-mail-workspace";

type WorkspaceState = ReturnType<typeof useMailWorkspace>;

export function AccountsPanel({ state }: { state: WorkspaceState }) {
  const { t } = useI18n();
  return (
    <div className={styles.sidePane}>
      <div className={styles.sectionLabel}>{t("mail.allMailboxes")}</div>
      <button
        type="button"
        className={`${styles.accountButton} ${state.accountFilter === "all" ? styles.accountActive : ""}`}
        onClick={() => state.changeAccount("all")}
      >
        <span>{t("mail.all")}</span>
        <span className={styles.count}>{state.inbox?.total_unread ?? 0}</span>
      </button>
      {state.accounts.map((account) => (
        <button
          type="button"
          key={account.id}
          className={`${styles.accountButton} ${state.accountFilter === account.id ? styles.accountActive : ""}`}
          onClick={() => state.changeAccount(account.id)}
        >
          <span className={styles.accountMeta}>
            <strong>{account.username}</strong>
            <small>{account.ownership_mode}</small>
          </span>
          <span className={styles.count}>
            {state.unreadByAccount.get(account.id) ?? 0}
          </span>
        </button>
      ))}
    </div>
  );
}

export function FoldersPanel({ state }: { state: WorkspaceState }) {
  const { t } = useI18n();
  return (
    <div className={styles.sidePane}>
      <div className={styles.sectionLabel}>{t("mail.folders")}</div>
      {!state.selectedAccountId && (
        <div className={styles.state}>{t("mail.allMailboxes")}</div>
      )}
      {state.selectableFolders.map((folder) => (
        <FolderButton key={folder.name} state={state} folder={folder} />
      ))}
    </div>
  );
}

export function ClassicSidePane({ state }: { state: WorkspaceState }) {
  const { t } = useI18n();
  return (
    <aside className={styles.sidePane}>
      <select
        className={styles.accountSelect}
        value={state.accountFilter}
        onChange={(event) => state.changeAccount(event.currentTarget.value)}
        aria-label={t("mail.allMailboxes")}
      >
        <option value="all">{t("mail.allMailboxes")}</option>
        {state.accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.username}
          </option>
        ))}
      </select>
      <div className={styles.sectionLabel}>{t("mail.folders")}</div>
      {state.selectableFolders.map((folder) => (
        <FolderButton key={folder.name} state={state} folder={folder} />
      ))}
    </aside>
  );
}

function FolderButton({
  state,
  folder,
}: {
  state: WorkspaceState;
  folder: WorkspaceState["selectableFolders"][number];
}) {
  return (
    <button
      type="button"
      className={`${styles.folderButton} ${state.folder === folder.name ? styles.folderActive : ""} ${state.dragTarget === folder.name ? styles.dropTarget : ""}`}
      onClick={() => state.setFolder(folder.name)}
      onDragEnter={(event) => dragOverFolder(event, state, folder.name)}
      onDragOver={(event) => dragOverFolder(event, state, folder.name)}
      onDragLeave={() => state.setDragTarget(null)}
      onDrop={(event) => {
        event.preventDefault();
        void state.dropMessagesIntoFolder(folder.name);
      }}
    >
      <span>{folder.name}</span>
      {folder.role && <span className={styles.count}>{folder.role}</span>}
    </button>
  );
}

function dragOverFolder(
  event: React.DragEvent,
  state: WorkspaceState,
  folder: string,
) {
  if (!state.dragMessages.length) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  state.setDragTarget(folder);
}

export function MessageListPane({ state }: { state: WorkspaceState }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const messages = useMemo(
    () => filterMessages(state.inbox?.messages ?? [], query),
    [query, state.inbox?.messages],
  );
  return (
    <section className={styles.listPane}>
      <div className={styles.listHeader}>
        <div className={styles.searchWrap}>
          <input
            className={styles.searchInput}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={t("nav.search")}
            aria-label={t("nav.search")}
          />
        </div>
        <button
          type="button"
          className={styles.refreshButton}
          onClick={() => void state.loadInbox()}
        >
          {t("mail.refresh")}
        </button>
      </div>
      <div className={styles.messageList}>
        {state.loading && (
          <div className={styles.state}>{t("mail.loading")}</div>
        )}
        {!state.loading && messages.length === 0 && (
          <div className={styles.state}>{t("mail.empty")}</div>
        )}
        {!state.loading &&
          messages.map((message) => (
            <MessageRow
              key={messageKey(message)}
              state={state}
              message={message}
            />
          ))}
      </div>
    </section>
  );
}

function MessageRow({
  state,
  message,
}: { state: WorkspaceState; message: InboxMessage }) {
  const { t } = useI18n();
  const key = messageKey(message);
  const attachments = t("mail.attachments").replace(
    "{count}",
    String(message.attachments.length),
  );
  return (
    <button
      type="button"
      className={`${styles.messageRow} ${!message.seen ? styles.unread : ""} ${state.selected && messageKey(state.selected) === key ? styles.messageSelected : ""} ${state.selectedKeys.has(key) ? styles.batchSelected : ""}`}
      draggable
      aria-pressed={state.selectedKeys.has(key)}
      onClick={(event) =>
        event.ctrlKey || event.metaKey
          ? state.toggleSelection(message)
          : void state.openMessage(message)
      }
      onDragStart={(event) => startMessageDrag(event, state, message)}
      onDragEnd={() => {
        state.setDragMessages([]);
        state.setDragTarget(null);
      }}
      onContextMenu={(event) => openRowMenu(event, state, message)}
    >
      <span className={styles.rowTop}>
        <span className={styles.sender}>{message.from_email}</span>
        <span className={styles.date}>{displayMailDate(message.date)}</span>
      </span>
      <span className={styles.subject}>
        {message.flagged ? "★ " : ""}
        {message.subject || t("mail.noSubject")}
      </span>
      <span className={styles.rowMeta}>
        <span className={styles.pill}>{message.account_address}</span>
        {message.attachments.length > 0 && <span>{attachments}</span>}
        {message.thread_id && <span>{t("mail.thread")}</span>}
      </span>
    </button>
  );
}

function startMessageDrag(
  event: React.DragEvent,
  state: WorkspaceState,
  message: InboxMessage,
) {
  const selected = state.selectionForDrag(message);
  state.setDragMessages(selected);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", selected.map(messageKey).join(","));
}

function openRowMenu(
  event: React.MouseEvent,
  state: WorkspaceState,
  message: InboxMessage,
) {
  event.preventDefault();
  void state.openContextMenuAt(message, {
    x: Math.min(event.clientX, window.innerWidth - 240),
    y: Math.min(event.clientY, window.innerHeight - 280),
  });
}

function filterMessages(messages: InboxMessage[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return messages;
  return messages.filter((message) =>
    `${message.from_email} ${message.subject}`.toLowerCase().includes(needle),
  );
}
