"use client";

import { enumLabel, useI18n } from "@/lib/i18n";
import type { InboxMessage } from "@/lib/types";
import Link from "next/link";
import { useMemo, useState } from "react";
import { mailFolderLabel } from "./mail-folder-label";
import { MailIcon, type MailIconName } from "./mail-icons";
import { displayMailDate, messageKey } from "./mail-workspace-utils";
import { SenderAvatar } from "./sender-avatar";
import styles from "./mail-workspace.module.css";
import type { useMailWorkspace } from "./use-mail-workspace";
import { standardFolderRank } from "./use-mailbox-navigation";

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
        <span className={styles.folderMain}>
          <span className={styles.folderIcon}><MailIcon name="inbox" size={17} /></span>
          <span>{t("mail.all")}</span>
        </span>
        <span className={styles.countBadge}>{state.inbox?.total_unread ?? 0}</span>
      </button>
      {state.accounts.map((account) => (
        <button
          type="button"
          key={account.id}
          className={`${styles.accountButton} ${state.accountFilter === account.id ? styles.accountActive : ""}`}
          onClick={() => state.changeAccount(account.id)}
        >
          <span className={styles.accountIdentity}>
            <SenderAvatar address={account.username} size="small" />
            <span className={styles.accountMeta}>
              <strong>{account.username}</strong>
              <small>{account.ownership_mode}</small>
            </span>
          </span>
          {(state.unreadByAccount.get(account.id) ?? 0) > 0 && (
            <span className={styles.countBadge}>{state.unreadByAccount.get(account.id) ?? 0}</span>
          )}
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
      <FolderList state={state} />
    </div>
  );
}

export function ClassicSidePane({ state }: { state: WorkspaceState }) {
  const { t } = useI18n();
  return (
    <aside className={styles.sidePane}>
      <div className={styles.accountPickerWrap}>
        <span className={styles.accountPickerIcon}><MailIcon name="mail" size={17} /></span>
        <select
          className={styles.accountSelect}
          value={state.accountFilter}
          onChange={(event) => state.changeAccount(event.currentTarget.value)}
          aria-label={t("mail.allMailboxes")}
        >
          <option value="all">{t("mail.allMailboxes")}</option>
          {state.accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.username}</option>
          ))}
        </select>
      </div>
      <div className={styles.sectionLabel}>{t("mail.folders")}</div>
      <FolderList state={state} />
      <div className={styles.sideFooter}>
        <Link href="/app/settings/folders" className={styles.sideFooterLink}>
          <MailIcon name="settings" size={16} />
          <span>{t("settings.nav.mailboxes")}</span>
        </Link>
      </div>
    </aside>
  );
}

function FolderList({ state }: { state: WorkspaceState }) {
  const { locale } = useI18n();
  const standard = state.selectableFolders.filter((folder) => standardFolderRank(folder) != null);
  const custom = state.selectableFolders.filter((folder) => standardFolderRank(folder) == null);
  const otherLabel = locale === "de" ? "Weitere Ordner" : locale === "es" ? "Otras carpetas" : "Other folders";
  return (
    <>
      {standard.map((folder) => (
        <FolderButton key={folder.name} state={state} folder={folder} />
      ))}
      {custom.length > 0 && (
        <div className={styles.folderDivider}>
          <span>{otherLabel}</span>
        </div>
      )}
      {custom.map((folder) => (
        <FolderButton key={folder.name} state={state} folder={folder} />
      ))}
    </>
  );
}

function FolderButton({ state, folder }: { state: WorkspaceState; folder: WorkspaceState["selectableFolders"][number] }) {
  const { locale } = useI18n();
  const unread = state.inbox?.counters.find(
    (item) => item.folder === folder.name && (!state.selectedAccountId || item.account_id === state.selectedAccountId),
  )?.unread;
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
      <span className={styles.folderMain}>
        <span className={styles.folderIcon}><MailIcon name={folderIcon(folder.role, folder.name)} size={17} /></span>
        <span className={styles.folderName}>{mailFolderLabel(folder, locale)}</span>
      </span>
      {typeof unread === "number" && unread > 0 ? (
        <span className={styles.countBadge}>{unread}</span>
      ) : null}
    </button>
  );
}

function folderIcon(role: string | null, name: string): MailIconName {
  const value = `${role ?? ""} ${name}`.toLowerCase();
  if (value.includes("inbox") || value.includes("posteingang")) return "inbox";
  if (value.includes("archive") || value.includes("archiv")) return "archive";
  if (value.includes("trash") || value.includes("papierkorb") || value.includes("deleted")) return "trash";
  if (value.includes("star") || value.includes("wichtig") || value.includes("favorite")) return "star";
  return "folder";
}

function dragOverFolder(event: React.DragEvent, state: WorkspaceState, folder: string) {
  if (!state.dragMessages.length) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  state.setDragTarget(folder);
}

export function MessageListPane({ state }: { state: WorkspaceState }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const messages = useMemo(() => filterMessages(state.inbox?.messages ?? [], query), [query, state.inbox?.messages]);
  return (
    <section className={styles.listPane}>
      <div className={styles.listHeader}>
        <div className={styles.searchWrap}>
          <MailIcon name="search" size={17} className={styles.searchIcon} />
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
          className={styles.headerIconButton}
          title={t("mail.refresh")}
          aria-label={t("mail.refresh")}
          onClick={() => void state.loadInbox()}
        >
          <MailIcon name="refresh" size={17} />
        </button>
        <Link
          href="/app/settings/workspace"
          className={styles.headerIconButton}
          title={t("settings.workspaceEditor.title")}
          aria-label={t("settings.workspaceEditor.title")}
        >
          <MailIcon name="settings" size={17} />
        </Link>
      </div>
      <div className={styles.messageList}>
        {state.loading && <div className={styles.state}>{t("mail.loading")}</div>}
        {!state.loading && messages.length === 0 && <div className={styles.state}>{t("mail.empty")}</div>}
        {!state.loading && messages.map((message) => (
          <MessageRow key={messageKey(message)} state={state} message={message} />
        ))}
      </div>
    </section>
  );
}

function MessageRow({ state, message }: { state: WorkspaceState; message: InboxMessage }) {
  const { t, locale } = useI18n();
  const key = messageKey(message);
  const tags = Array.from(new Set([...message.system_tags, ...message.user_tags, ...message.keywords])).filter((tag) => tag.trim());
  const visibleTags = tags.slice(0, 3);
  const hiddenTagCount = Math.max(0, tags.length - visibleTags.length);
  return (
    <button
      type="button"
      className={`${styles.messageRow} ${!message.seen ? styles.unread : ""} ${state.selected && messageKey(state.selected) === key ? styles.messageSelected : ""} ${state.selectedKeys.has(key) ? styles.batchSelected : ""}`}
      draggable
      aria-pressed={state.selectedKeys.has(key)}
      onClick={(event) => event.ctrlKey || event.metaKey ? state.toggleSelection(message) : void state.openMessage(message)}
      onDragStart={(event) => startMessageDrag(event, state, message)}
      onDragEnd={() => {
        state.setDragMessages([]);
        state.setDragTarget(null);
      }}
      onContextMenu={(event) => openRowMenu(event, state, message)}
    >
      <SenderAvatar address={message.from_email} unread={!message.seen} />
      <span className={styles.rowContent}>
        <span className={styles.rowTop}>
          <span className={styles.sender}>{displaySender(message.from_email)}</span>
          <span className={styles.date}>{displayMailDate(message.date)}</span>
        </span>
        <span className={styles.subjectLine}>
          {message.flagged && <MailIcon name="star" size={13} className={styles.starIcon} />}
          <span className={styles.subject}>{message.subject || t("mail.noSubject")}</span>
        </span>
        <span className={styles.rowMeta}>
          {message.category && (
            <span className={styles.classificationPill}>{enumLabel(t, "category", message.category)}</span>
          )}
          {message.importance && message.importance !== "unknown" && (
            <span className={styles.importancePill}>{message.importance}</span>
          )}
          {message.review_required && (
            <span className={styles.reviewPill}>{locale === "de" ? "Prüfung" : locale === "es" ? "Revisión" : "Review"}</span>
          )}
          {visibleTags.map((tag) => (
            <span key={tag} className={styles.tagPill}><MailIcon name="tag" size={10} />{tag}</span>
          ))}
          {hiddenTagCount > 0 && <span className={styles.tagMore}>+{hiddenTagCount}</span>}
          {state.accountFilter === "all" && <span className={styles.accountPill}>{message.account_address}</span>}
          {message.attachments.length > 0 && (
            <span className={styles.metaIcon} title={t("mail.attachments").replace("{count}", String(message.attachments.length))}>
              <MailIcon name="paperclip" size={12} />{message.attachments.length}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function displaySender(value: string): string {
  const match = value.match(/^\s*([^<]+?)\s*<[^>]+>\s*$/);
  return match?.[1]?.trim() || value;
}

function startMessageDrag(event: React.DragEvent, state: WorkspaceState, message: InboxMessage) {
  const selected = state.selectionForDrag(message);
  state.setDragMessages(selected);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", selected.map(messageKey).join(","));
}

function openRowMenu(event: React.MouseEvent, state: WorkspaceState, message: InboxMessage) {
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
    `${message.from_email} ${message.subject} ${message.category ?? ""} ${message.subcategory ?? ""} ${message.system_tags.join(" ")} ${message.user_tags.join(" ")} ${message.keywords.join(" ")}`
      .toLowerCase()
      .includes(needle),
  );
}
