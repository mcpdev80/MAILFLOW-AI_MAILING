"use client";

import { mailAttachmentUrl } from "@/lib/api";
import { enumLabel, useI18n } from "@/lib/i18n";
import type { MessageDetail } from "@/lib/types";
import { mailFolderLabel } from "./mail-folder-label";
import { MailIcon } from "./mail-icons";
import { formatAttachmentBytes, messageKey } from "./mail-workspace-utils";
import { SenderAvatar } from "./sender-avatar";
import styles from "./mail-workspace.module.css";
import type { useMailWorkspace } from "./use-mail-workspace";

type WorkspaceState = ReturnType<typeof useMailWorkspace>;

export function ContentPane({ state, actionBarBottom = false }: { state: WorkspaceState; actionBarBottom?: boolean }) {
  const { t } = useI18n();
  const messages = state.thread?.messages?.length ? state.thread.messages : state.selected ? [state.selected] : [];
  return (
    <section className={styles.contentPane}>
      {!actionBarBottom && <ActionToolbar state={state} />}
      <div className={styles.detailScroll}>
        {!state.selected && !state.messageLoading && (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateCard}>
              <span className={styles.emptyStateIcon}><MailIcon name="mail" size={24} /></span>
              <strong>{t("mail.selectMessage")}</strong>
              <p>{t("mail.selectMessageHint")}</p>
            </div>
          </div>
        )}
        {state.messageLoading && <div className={styles.state}>{t("mail.opening")}</div>}
        {!state.messageLoading && state.selected && (
          <div className={styles.messageCanvas}>
            {messages.map((message) => <MessageArticle key={messageKey(message)} message={message} />)}
            <InsightCard state={state} />
          </div>
        )}
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
      <div className={styles.toolbarPrimary}>
        <ToolbarIcon label={t("mail.reply")} primary onClick={() => void state.openReply("reply")} icon="reply" />
        <ToolbarIcon label={t("mail.replyAll")} onClick={() => void state.openReply("reply_all")} icon="replyAll" />
        <ToolbarIcon label={t("mail.forward")} onClick={() => void state.openReply("forward")} icon="forward" />
      </div>
      <span className={styles.toolbarDivider} />
      <div className={styles.toolbarPrimary}>
        {capabilities?.archive && <ToolbarIcon label={t("mail.action.archive")} onClick={() => void state.runActionFor(selected, { action: "archive" })} icon="archive" />}
        {capabilities?.tags && <ToolbarIcon label={t("mail.group.organize")} onClick={() => addTag(state, t("mail.tagPrompt"))} icon="tag" />}
        {capabilities?.trash && <ToolbarIcon label={t("common.delete")} danger onClick={() => void state.runActionFor(selected, { action: "trash" })} icon="trash" />}
      </div>
      {capabilities?.move && <MoveControls state={state} />}
      <div className={styles.toolbarSpacer} />
      <MoreButton state={state} />
    </div>
  );
}

function ToolbarIcon({ label, icon, onClick, primary = false, danger = false }: { label: string; icon: "reply" | "replyAll" | "forward" | "archive" | "tag" | "trash"; onClick: () => void; primary?: boolean; danger?: boolean }) {
  return (
    <button type="button" className={`${styles.toolbarIconButton} ${primary ? styles.primaryAction : ""} ${danger ? styles.dangerAction : ""}`} title={label} aria-label={label} onClick={onClick}>
      <MailIcon name={icon} size={18} />
    </button>
  );
}

function MoveControls({ state }: { state: WorkspaceState }) {
  const { t, locale } = useI18n();
  const selected = state.selected;
  if (!selected) return null;
  return (
    <div className={styles.moveGroup}>
      <select className={styles.moveSelect} value={state.moveFolder} onChange={(event) => state.setMoveFolder(event.currentTarget.value)} aria-label={t("mail.moveTo")}>
        <option value="">{t("mail.moveTo")}</option>
        {state.selectableFolders.filter((folder) => folder.name !== selected.folder).map((folder) => (
          <option key={folder.name} value={folder.name}>{mailFolderLabel(folder, locale)}</option>
        ))}
      </select>
      <button type="button" className={styles.moveButton} disabled={!state.moveFolder || state.actionLoading} title={t("mail.move")} aria-label={t("mail.move")} onClick={() => void state.runActionFor(selected, { action: "move", destination_folder: state.moveFolder })}>
        <MailIcon name="chevron" size={15} />
      </button>
    </div>
  );
}

function MoreButton({ state }: { state: WorkspaceState }) {
  const { t } = useI18n();
  const selected = state.selected;
  if (!selected) return null;
  return (
    <button type="button" className={styles.toolbarIconButton} aria-label={t("mail.moreActions")} title={t("mail.moreActions")} onClick={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      void state.openContextMenuAt(selected, { x: Math.max(8, rect.right - 220), y: rect.bottom + 4 });
    }}>
      <MailIcon name="more" size={19} />
    </button>
  );
}

function addTag(state: WorkspaceState, prompt: string) {
  const tag = window.prompt(prompt)?.trim();
  if (tag && state.selected) void state.runActionFor(state.selected, { action: "add_tags", tags: [tag] });
}

function MessageArticle({ message }: { message: MessageDetail }) {
  const { t, locale } = useI18n();
  const tags = Array.from(new Set([...message.system_tags, ...message.user_tags, ...message.keywords])).filter((tag) => tag.trim());
  return (
    <article className={styles.threadMessage}>
      <header className={styles.messageHeader}>
        <SenderAvatar address={message.from_email} size="large" />
        <div className={styles.senderBlock}>
          <div className={styles.senderTitleLine}>
            <strong>{displaySender(message.from_email)}</strong>
            {message.flagged && <MailIcon name="star" size={14} className={styles.starIcon} />}
          </div>
          <span className={styles.senderAddress}>{message.from_email}</span>
          <span>
            {t("mail.to")}: {message.to_emails.join(", ") || message.account_address}
            {message.cc_emails.length ? ` · ${t("mail.cc")}: ${message.cc_emails.join(", ")}` : ""}
          </span>
        </div>
        <span className={styles.messageTime}>{message.date ? new Date(message.date).toLocaleString(locale) : ""}</span>
      </header>
      <h2 className={styles.messageTitle}>{message.subject || t("mail.noSubject")}</h2>
      {(message.category || tags.length > 0 || message.review_required) && (
        <div className={styles.detailBadges}>
          {message.category && <span className={styles.classificationPill}>{enumLabel(t, "category", message.category)}</span>}
          {message.importance && message.importance !== "unknown" && <span className={styles.importancePill}>{message.importance}</span>}
          {message.review_required && <span className={styles.reviewPill}>{locale === "de" ? "Prüfung" : locale === "es" ? "Revisión" : "Review"}</span>}
          {tags.map((tag) => <span key={tag} className={styles.tagPill}><MailIcon name="tag" size={10} />{tag}</span>)}
        </div>
      )}
      <div className={styles.messageBodyCard}>
        {message.safe_html ? (
          <div className={styles.mailBody} /* biome-ignore lint/security/noDangerouslySetInnerHtml: API sanitizes this fragment. */ dangerouslySetInnerHTML={{ __html: message.safe_html }} />
        ) : (
          <div className={styles.mailBody}>{message.body_text || t("mail.emptyMessage")}</div>
        )}
      </div>
      {message.attachments.length > 0 && (
        <div className={styles.attachments}>
          {message.attachments.map((attachment) => (
            <a key={attachment.part_id} className={styles.attachment} href={mailAttachmentUrl(message.account_id, message.folder, message.uid, attachment.part_id)}>
              <span className={styles.attachmentIcon}><MailIcon name="paperclip" size={16} /></span>
              <span className={styles.attachmentText}><strong>{attachment.filename}</strong><small>{formatAttachmentBytes(attachment.size)}</small></span>
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
      <div className={styles.insightTitle}><span className={styles.aiDot} />{t("mail.aiSummary")}</div>
      <p>{insights.overview}</p>
      {insights.deadline && <p><strong>{t("mail.deadline")}:</strong> {insights.deadline}</p>}
      {insights.todos.length > 0 && <ul className={styles.insightList}>{insights.todos.map((item) => <li key={item}>{item}</li>)}</ul>}
    </section>
  );
}

function displaySender(value: string): string {
  const match = value.match(/^\s*([^<]+?)\s*<[^>]+>\s*$/);
  return match?.[1]?.trim() || value;
}
