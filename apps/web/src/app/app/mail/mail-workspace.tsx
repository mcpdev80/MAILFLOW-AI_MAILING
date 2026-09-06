"use client";

import { MailContextMenu } from "@/components/mail-context-menu";
import { mailAttachmentUrl } from "@/lib/api";
import { useAppearance } from "@/lib/appearance-preferences";
import { useI18n } from "@/lib/i18n";
import type { InboxMessage, MessageDetail, WorkspacePanel } from "@/lib/types";
import { useMemo, useState } from "react";
import styles from "./mail-workspace.module.css";
import { messageKey } from "./mail-workspace-utils";
import { useMailWorkspace } from "./use-mail-workspace";

type WorkspaceState = ReturnType<typeof useMailWorkspace>;

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

function formatBytes(value: number | null): string {
  if (value == null) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function AccountsPanel({ state }: { state: WorkspaceState }) {
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
          <span className={styles.count}>{state.unreadByAccount.get(account.id) ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

function FoldersPanel({ state }: { state: WorkspaceState }) {
  const { t } = useI18n();
  return (
    <div className={styles.sidePane}>
      <div className={styles.sectionLabel}>{t("mail.folders")}</div>
      {!state.selectedAccountId && <div className={styles.state}>{t("mail.allMailboxes")}</div>}
      {state.selectableFolders.map((folder) => (
        <button
          type="button"
          key={folder.name}
          className={`${styles.folderButton} ${state.folder === folder.name ? styles.folderActive : ""} ${state.dragTarget === folder.name ? styles.dropTarget : ""}`}
          onClick={() => state.setFolder(folder.name)}
          onDragEnter={(event) => {
            if (!state.dragMessages.length) return;
            event.preventDefault();
            state.setDragTarget(folder.name);
          }}
          onDragOver={(event) => {
            if (!state.dragMessages.length) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            state.setDragTarget(folder.name);
          }}
          onDragLeave={() => state.setDragTarget(null)}
          onDrop={(event) => {
            event.preventDefault();
            void state.dropMessagesIntoFolder(folder.name);
          }}
        >
          <span>{folder.name}</span>
          {folder.role && <span className={styles.count}>{folder.role}</span>}
        </button>
      ))}
    </div>
  );
}

function ClassicSidePane({ state }: { state: WorkspaceState }) {
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
        <button
          type="button"
          key={folder.name}
          className={`${styles.folderButton} ${state.folder === folder.name ? styles.folderActive : ""} ${state.dragTarget === folder.name ? styles.dropTarget : ""}`}
          onClick={() => state.setFolder(folder.name)}
          onDragEnter={(event) => {
            if (!state.dragMessages.length) return;
            event.preventDefault();
            state.setDragTarget(folder.name);
          }}
          onDragOver={(event) => {
            if (!state.dragMessages.length) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            state.setDragTarget(folder.name);
          }}
          onDragLeave={() => state.setDragTarget(null)}
          onDrop={(event) => {
            event.preventDefault();
            void state.dropMessagesIntoFolder(folder.name);
          }}
        >
          <span>{folder.name}</span>
          {folder.role && <span className={styles.count}>{folder.role}</span>}
        </button>
      ))}
    </aside>
  );
}

function MessageListPane({ state }: { state: WorkspaceState }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const messages = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return state.inbox?.messages ?? [];
    return (state.inbox?.messages ?? []).filter((message) =>
      `${message.from_email} ${message.subject}`.toLowerCase().includes(needle),
    );
  }, [query, state.inbox?.messages]);

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
        <button type="button" className={styles.refreshButton} onClick={() => void state.loadInbox()}>
          {t("mail.refresh")}
        </button>
      </div>
      <div className={styles.messageList}>
        {state.loading && <div className={styles.state}>{t("mail.loading")}</div>}
        {!state.loading && messages.length === 0 && <div className={styles.state}>{t("mail.empty")}</div>}
        {!state.loading && messages.map((message) => (
          <button
            type="button"
            key={messageKey(message)}
            className={`${styles.messageRow} ${!message.seen ? styles.unread : ""} ${state.selected && messageKey(state.selected) === messageKey(message) ? styles.messageSelected : ""} ${state.selectedKeys.has(messageKey(message)) ? styles.batchSelected : ""}`}
            draggable
            aria-pressed={state.selectedKeys.has(messageKey(message))}
            onClick={(event) => {
              if (event.ctrlKey || event.metaKey) {
                state.toggleSelection(message);
                return;
              }
              void state.openMessage(message);
            }}
            onDragStart={(event) => {
              const selected = state.selectionForDrag(message);
              state.setDragMessages(selected);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", selected.map(messageKey).join(","));
            }}
            onDragEnd={() => {
              state.setDragMessages([]);
              state.setDragTarget(null);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              void state.openContextMenuAt(message, {
                x: Math.min(event.clientX, window.innerWidth - 240),
                y: Math.min(event.clientY, window.innerHeight - 280),
              });
            }}
          >
            <span className={styles.rowTop}>
              <span className={styles.sender}>{message.from_email}</span>
              <span className={styles.date}>{displayDate(message.date)}</span>
            </span>
            <span className={styles.subject}>{message.flagged ? "★ " : ""}{message.subject || t("mail.noSubject")}</span>
            <span className={styles.rowMeta}>
              <span className={styles.pill}>{message.account_address}</span>
              {message.attachments.length > 0 && <span>{message.attachments.length} attachment(s)</span>}
              {message.thread_id && <span>{t("mail.thread")}</span>}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ActionToolbar({ state, bottom = false }: { state: WorkspaceState; bottom?: boolean }) {
  const { t } = useI18n();
  const selected = state.selected;
  const capabilities = state.metadata?.capabilities;
  if (!selected) return null;

  return (
    <div className={`${styles.toolbar} ${bottom ? styles.toolbarBottom : ""}`}>
      <button type="button" className={`${styles.toolbarButton} ${styles.primaryAction}`} onClick={() => void state.openReply("reply")}>{t("mail.reply")}</button>
      <button type="button" className={styles.toolbarButton} onClick={() => void state.openReply("reply_all")}>{t("mail.replyAll")}</button>
      <button type="button" className={styles.toolbarButton} onClick={() => void state.openReply("forward")}>{t("mail.forward")}</button>
      {capabilities?.archive && <button type="button" className={styles.toolbarButton} onClick={() => void state.runActionFor(selected, { action: "archive" })}>{t("mailActions.archive")}</button>}
      {capabilities?.move && (
        <div className={styles.moveGroup}>
          <select className={styles.moveSelect} value={state.moveFolder} onChange={(event) => state.setMoveFolder(event.currentTarget.value)}>
            <option value="">{t("mail.moveTo")}</option>
            {state.selectableFolders.filter((folder) => folder.name !== selected.folder).map((folder) => (
              <option key={folder.name} value={folder.name}>{folder.name}</option>
            ))}
          </select>
          <button type="button" className={styles.toolbarButton} disabled={!state.moveFolder || state.actionLoading} onClick={() => void state.runActionFor(selected, { action: "move", destination_folder: state.moveFolder })}>{t("mail.move")}</button>
        </div>
      )}
      {capabilities?.tags && <button type="button" className={styles.toolbarButton} onClick={() => {
        const tag = window.prompt("Tag")?.trim();
        if (tag) void state.runActionFor(selected, { action: "add_tags", tags: [tag] });
      }}>{t("mailActions.organize")}</button>}
      {capabilities?.trash && <button type="button" className={`${styles.toolbarButton} ${styles.dangerAction}`} onClick={() => void state.runActionFor(selected, { action: "trash" })}>{t("common.delete")}</button>}
      <button
        type="button"
        className={styles.toolbarButton}
        aria-label={t("mail.moreActions")}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          void state.openContextMenuAt(selected, { x: Math.max(8, rect.right - 220), y: rect.bottom + 4 });
        }}
      >
        …
      </button>
    </div>
  );
}

function MessageArticle({ message }: { message: MessageDetail }) {
  const { t } = useI18n();
  return (
    <article className={styles.threadMessage}>
      <header className={styles.messageHeader}>
        <div className={styles.senderBlock}>
          <strong>{message.from_email}</strong>
          <span>{t("mail.to")}: {message.to_emails.join(", ") || message.account_address}{message.cc_emails.length ? ` · ${t("mail.cc")}: ${message.cc_emails.join(", ")}` : ""}</span>
        </div>
        <span className={styles.messageTime}>{message.date ? new Date(message.date).toLocaleString() : ""}</span>
      </header>
      <h2 className={styles.messageTitle}>{message.subject || t("mail.noSubject")}</h2>
      {message.safe_html ? (
        <iframe className={styles.mailFrame} sandbox="" srcDoc={message.safe_html} title={`Message from ${message.from_email}`} />
      ) : (
        <div className={styles.mailBody}>{message.body_text || t("mail.emptyMessage")}</div>
      )}
      {message.attachments.length > 0 && (
        <div className={styles.attachments}>
          {message.attachments.map((attachment) => (
            <a
              key={attachment.part_id}
              className={styles.attachment}
              href={mailAttachmentUrl(message.account_id, message.folder, message.uid, attachment.part_id)}
            >
              <strong>{attachment.filename}</strong>
              <small>{formatBytes(attachment.size)}</small>
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

function InsightCard({ state }: { state: WorkspaceState }) {
  const { t } = useI18n();
  const insights = state.thread?.insights;
  if (!insights) return null;
  return (
    <section className={styles.insightCard}>
      <strong>{t("mail.aiSummary")}</strong>
      <p>{insights.overview}</p>
      {insights.deadline && <p><strong>{t("mail.deadline")}:</strong> {insights.deadline}</p>}
      {insights.todos.length > 0 && <ul className={styles.insightList}>{insights.todos.map((item) => <li key={item}>{item}</li>)}</ul>}
    </section>
  );
}

function ContentPane({ state, actionBarBottom = false }: { state: WorkspaceState; actionBarBottom?: boolean }) {
  const { t } = useI18n();
  const messages = state.thread?.messages?.length ? state.thread.messages : state.selected ? [state.selected] : [];
  return (
    <section className={styles.contentPane}>
      {!actionBarBottom && <ActionToolbar state={state} />}
      <div className={styles.detailScroll}>
        {!state.selected && !state.messageLoading && (
          <div className={styles.emptyState}>
            <div><strong>{t("mail.selectMessage")}</strong><p>{t("mail.selectMessageHint")}</p></div>
          </div>
        )}
        {state.messageLoading && <div className={styles.state}>{t("mail.opening")}</div>}
        {!state.messageLoading && state.selected && (
          <>
            {messages.map((message) => <MessageArticle key={messageKey(message)} message={message} />)}
            <InsightCard state={state} />
          </>
        )}
      </div>
      {actionBarBottom && <ActionToolbar state={state} bottom />}
    </section>
  );
}

function StandardWorkspace({ state }: { state: WorkspaceState }) {
  const appearance = useAppearance();
  return (
    <div className={styles.workspace} data-layout={appearance.workspaceLayout} data-side={appearance.sidePanelAlignment}>
      <ClassicSidePane state={state} />
      <MessageListPane state={state} />
      <ContentPane state={state} />
    </div>
  );
}

function CustomWorkspace({ state }: { state: WorkspaceState }) {
  const appearance = useAppearance();
  const config = appearance.workspaceCustomConfig;
  if (!config) return <StandardWorkspace state={state} />;
  const renderPanel = (panel: WorkspacePanel) => {
    if (panel === "accounts") return <AccountsPanel state={state} />;
    if (panel === "folders") return <FoldersPanel state={state} />;
    if (panel === "message_list") return <MessageListPane state={state} />;
    return <ContentPane state={state} actionBarBottom={config.action_bar_dock === "bottom"} />;
  };
  return (
    <div className={styles.customWorkspace}>
      {[...config.panels].sort((a, b) => a.order - b.order).filter((panel) => panel.visible).map((panel) => {
        const fullRow = panel.dock === "top" || panel.dock === "bottom";
        const basis = fullRow ? "100%" : panel.size_px ? `${panel.size_px}px` : panel.panel === "message_content" ? "480px" : "240px";
        return (
          <section
            key={panel.panel}
            className={styles.customPanel}
            data-full-row={fullRow}
            style={{ flexBasis: basis, flexGrow: panel.panel === "message_content" && !fullRow ? 1 : 0, order: panel.order }}
          >
            {renderPanel(panel.panel)}
          </section>
        );
      })}
    </div>
  );
}

function Overlays({ state }: { state: WorkspaceState }) {
  const { t } = useI18n();
  return (
    <>
      {state.contextMenu && (
        <MailContextMenu
          position={state.contextMenu.position}
          capabilities={state.contextMenu.capabilities}
          seen={state.contextMenu.message.seen}
          flagged={state.contextMenu.message.flagged}
          onClose={() => state.setContextMenu(null)}
          onAction={(action) => state.executeContextAction(action, state.contextMenu!.message)}
        />
      )}
      {state.undoMoves.length > 0 && (
        <output className={styles.undoToast}>
          <span>{t("mail.moved").replace("{count}", String(state.undoMoves.length))}</span>
          <button type="button" className={styles.secondaryButton} onClick={() => void state.undoLastMove()}>{t("mail.undo")}</button>
          <button type="button" className={styles.iconButton} aria-label={t("mail.dismissUndo")} onClick={() => state.setUndoMoves([])}>×</button>
        </output>
      )}
      {state.aiResult && (
        <div className={styles.dialogBackdrop} role="presentation">
          <dialog open className={styles.dialog} aria-label={state.aiResult.title}>
            <header className={styles.dialogHeader}>
              <strong>{state.aiResult.title}</strong>
              <button type="button" className={styles.iconButton} onClick={() => state.setAiResult(null)} aria-label={t("mail.close")}>×</button>
            </header>
            <pre>{state.aiResult.body}</pre>
          </dialog>
        </div>
      )}
    </>
  );
}

export function MailWorkspace() {
  const state = useMailWorkspace();
  const appearance = useAppearance();
  return (
    <main className={styles.page}>
      {state.error && <div className={styles.error}>{state.error}</div>}
      {appearance.workspaceLayout === "custom" ? <CustomWorkspace state={state} /> : <StandardWorkspace state={state} />}
      <Overlays state={state} />
    </main>
  );
}
