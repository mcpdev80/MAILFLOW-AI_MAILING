"use client";

import { MailContextMenu } from "@/components/mail-context-menu";
import { useI18n } from "@/lib/i18n";
import styles from "./mail-workspace.module.css";
import type { useMailWorkspace } from "./use-mail-workspace";

type WorkspaceState = ReturnType<typeof useMailWorkspace>;

export function WorkspaceOverlays({ state }: { state: WorkspaceState }) {
  return (
    <>
      {state.contextMenu && <ContextMenuOverlay state={state} />}
      {state.undoMoves.length > 0 && <UndoToast state={state} />}
      {state.aiResult && <AiDialog state={state} />}
    </>
  );
}

function ContextMenuOverlay({ state }: { state: WorkspaceState }) {
  const menu = state.contextMenu!;
  return (
    <MailContextMenu
      position={menu.position}
      capabilities={menu.capabilities}
      seen={menu.message.seen}
      flagged={menu.message.flagged}
      onClose={() => state.setContextMenu(null)}
      onAction={(action) => state.executeContextAction(action, menu.message)}
    />
  );
}

function UndoToast({ state }: { state: WorkspaceState }) {
  const { t } = useI18n();
  return (
    <output className={styles.undoToast}>
      <span>{t("mail.moved").replace("{count}", String(state.undoMoves.length))}</span>
      <button type="button" className={styles.secondaryButton} onClick={() => void state.undoLastMove()}>{t("mail.undo")}</button>
      <button type="button" className={styles.iconButton} aria-label={t("mail.dismissUndo")} onClick={() => state.setUndoMoves([])}>×</button>
    </output>
  );
}

function AiDialog({ state }: { state: WorkspaceState }) {
  const { t } = useI18n();
  const result = state.aiResult!;
  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <dialog open className={styles.dialog} aria-label={result.title}>
        <header className={styles.dialogHeader}><strong>{result.title}</strong><button type="button" className={styles.iconButton} onClick={() => state.setAiResult(null)} aria-label={t("mail.close")}>×</button></header>
        <pre>{result.body}</pre>
      </dialog>
    </div>
  );
}
