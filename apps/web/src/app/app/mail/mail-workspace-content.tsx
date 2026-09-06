"use client";

import { mailAttachmentUrl } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { MessageDetail } from "@/lib/types";
import styles from "./mail-workspace.module.css";
import { formatAttachmentBytes, messageKey } from "./mail-workspace-utils";
import type { useMailWorkspace } from "./use-mail-workspace";

type WorkspaceState = ReturnType<typeof useMailWorkspace>;

export function ContentPane({ state, actionBarBottom = false }: { state: WorkspaceState; actionBarBottom?: boolean }) {
  const { t } = useI18n();
  const messages = state.thread?.messages?.length ? state.thread.messages : state.selected ? [state.selected] : [];
  return (
    <section className={styles.contentPane}>
      {!actionBarBottom && <ActionToolbar state={state} />}
      <div className={styles.detailScroll}>
        {!state.selected && !state.messageLoading && <div className={styles.emptyState}><div><strong>{t("mail.selectMessage")}</strong><p>{t("mail.selectMessageHint")}</p></div></div>}
        {state.messageLoading && <div className={styles.state}>{t("mail.opening")}</div>}
        {!state.messageLoading && state.selected && <>{messages.map((message) => <MessageArticle key={messageKey(message)} message={message} />)}<InsightCard state={state} /></>}
      </div>
      {actionBarBottom && <ActionToolbar state={state} bottom />}
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
      {capabilities?.move && <MoveControls state={state} />}
      {capabilities?.tags && <button type="button" className={styles.toolbarButton} onClick={() => addTag(state)}>{t("mailActions.organize")}</button>}
      {capabilities?.trash && <button type="button" className={`${styles.toolbarButton} ${styles.dangerAction}`} onClick={() => void state.runActionFor(selected, { action: "trash" })}>{t("common.delete")}</button>}
      <MoreButton state={state} />
    </div>
  );
}

function MoveControls({ state }: { state: WorkspaceState }) {
  const { t } = useI18n();
  const selected = state.selected!;
  return (
    <div className={styles.moveGroup}>
      <select className={styles.moveSelect} value={state.moveFolder} onChange={(event) => state.setMoveFolder(event.currentTarget.value)}>
        <option value="">{t("mail.moveTo")}</option>
        {state.selectableFolders.filter((folder) => folder.name !== selected.folder).map((folder) => <option key={folder.name} value={folder.name}>{folder.name}</option>)}
      </select>
      <button type="button" className={styles.toolbarButton} disabled={!state.moveFolder || state.actionLoading} onClick={() => void state.runActionFor(selected, { action: "move", destination_folder: state.moveFolder })}>{t("mail.move")}</button>
    </div>
  );
}

function MoreButton({ state }: { state: WorkspaceState }) {
  const { t } = useI18n();
  return (
    <button type="button" className={styles.toolbarButton} aria-label={t("mail.moreActions")} onClick={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      void state.openContextMenuAt(state.selected!, { x: Math.max(8, rect.right - 220), y: rect.bottom + 4 });
    }}>…</button>
  );
}

function addTag(state: WorkspaceState) {
  const tag = window.prompt("Tag")?.trim();
  if (tag && state.selected) void state.runActionFor(state.selected, { action: "add_tags", tags: [tag] });
}

function MessageArticle({ message }: { message: MessageDetail }) {
  const { t, locale } = useI18n();
  return (
    <article className={styles.threadMessage}>
      <header className={styles.messageHeader}>
        <div className={styles.senderBlock}><strong>{message.from_email}</strong><span>{t("mail.to")}: {message.to_emails.join(", ") || message.account_address}{message.cc_emails.length ? ` · ${t("mail.cc")}: ${message.cc_emails.join(", ")}` : ""}</span></div>
        <span className={styles.messageTime}>{message.date ? new Date(message.date).toLocaleString(locale) : ""}</span>
      </header>
      <h2 className={styles.messageTitle}>{message.subject || t("mail.noSubject")}</h2>
      {message.safe_html ? <iframe className={styles.mailFrame} sandbox="" srcDoc={message.safe_html} title={`${t("mail.messageFrom")} ${message.from_email}`} /> : <div className={styles.mailBody}>{message.body_text || t("mail.emptyMessage")}</div>}
      {message.attachments.length > 0 && <div className={styles.attachments}>{message.attachments.map((attachment) => <a key={attachment.part_id} className={styles.attachment} href={mailAttachmentUrl(message.account_id, message.folder, message.uid, attachment.part_id)}><strong>{attachment.filename}</strong><small>{formatAttachmentBytes(attachment.size)}</small></a>)}</div>}
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
