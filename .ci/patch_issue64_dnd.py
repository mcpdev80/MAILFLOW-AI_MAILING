from pathlib import Path

path = Path("apps/web/src/app/app/mail/page.tsx")
text = path.read_text()

text = text.replace(
    'import type { MailActionId } from "@/lib/mail-actions";\n',
    'import type { MailActionId } from "@/lib/mail-actions";\n'
    'import { undoMailMove } from "@/lib/mail-ux-api";\n',
)
text = text.replace(
    '  MailboxMetadata,\n  MessageDetail,\n  ThreadView,\n',
    '  MailboxCapabilities,\n  MailboxMetadata,\n  MessageDetail,\n  ThreadInsights,\n  ThreadView,\n',
)

state_anchor = '''  const [contextMenu, setContextMenu] = useState<{
    position: ContextMenuPosition;
    message: InboxMessage;
  } | null>(null);
'''
state_repl = '''  const [contextMenu, setContextMenu] = useState<{
    position: ContextMenuPosition;
    message: InboxMessage;
    capabilities: MailboxCapabilities;
  } | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [dragMessages, setDragMessages] = useState<InboxMessage[]>([]);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [undoMoves, setUndoMoves] = useState<
    Array<{
      account_id: string;
      message_id: string;
      current_folder: string;
      original_folder: string;
    }>
  >([]);
'''
if state_anchor not in text:
    raise SystemExit("state anchor missing")
text = text.replace(state_anchor, state_repl)

helper_anchor = '''  async function openMessage(message: InboxMessage) {
'''
helpers = '''  async function openContextMenuAt(
    message: InboxMessage,
    position: ContextMenuPosition,
  ) {
    try {
      const meta = await ensureMetadata(message.account_id);
      setContextMenu({ position, message, capabilities: meta.capabilities });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load message actions");
    }
  }

  function selectionForDrag(message: InboxMessage): InboxMessage[] {
    const key = messageKey(message);
    if (!selectedKeys.has(key)) return [message];
    return (inbox?.messages ?? []).filter(
      (item) =>
        selectedKeys.has(messageKey(item)) && item.account_id === message.account_id,
    );
  }

  async function dropMessagesIntoFolder(destination: string) {
    if (!selectedAccountId || dragMessages.length === 0) return;
    const candidates = dragMessages.filter(
      (item) =>
        item.account_id === selectedAccountId && item.folder !== destination,
    );
    if (candidates.length === 0) return;
    setActionLoading(true);
    setError(null);
    const completed: Array<{
      account_id: string;
      message_id: string;
      current_folder: string;
      original_folder: string;
    }> = [];
    try {
      for (const item of candidates) {
        await api.mailAction(item.account_id, item.folder, item.uid, {
          action: "move",
          destination_folder: destination,
        });
        completed.push({
          account_id: item.account_id,
          message_id: item.message_id,
          current_folder: destination,
          original_folder: item.folder,
        });
      }
      setUndoMoves(completed);
      setSelectedKeys(new Set());
      if (
        selected &&
        candidates.some((item) => messageKey(item) === messageKey(selected))
      ) {
        setSelected(null);
        setThread(null);
      }
      await loadInbox();
    } catch (err) {
      if (completed.length > 0) setUndoMoves(completed);
      setError(err instanceof ApiError ? err.message : "Could not move all selected messages");
      await loadInbox();
    } finally {
      setDragMessages([]);
      setDragTarget(null);
      setActionLoading(false);
    }
  }

  async function undoLastMove() {
    if (undoMoves.length === 0) return;
    setActionLoading(true);
    setError(null);
    const pending = [...undoMoves];
    setUndoMoves([]);
    try {
      for (const item of pending) {
        await undoMailMove(item.account_id, {
          message_id: item.message_id,
          current_folder: item.current_folder,
          original_folder: item.original_folder,
        });
      }
      await loadInbox();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not undo move");
      await loadInbox();
    } finally {
      setActionLoading(false);
    }
  }

'''
if helper_anchor not in text:
    raise SystemExit("openMessage anchor missing")
text = text.replace(helper_anchor, helpers + helper_anchor)

old_show = '''  function showExistingInsight(action: MailActionId) {
    const insights = thread?.insights;
'''
new_show = '''  function showExistingInsight(
    action: MailActionId,
    insights: ThreadInsights | null | undefined = thread?.insights,
  ) {
'''
if old_show not in text:
    raise SystemExit("show insight anchor missing")
text = text.replace(old_show, new_show)

old_ai = '''      const detail = await detailFor(message);
      if (!selected || messageKey(selected) !== messageKey(detail))
        await openMessage(message);
      showExistingInsight(action);
      return;
'''
new_ai = '''      const detail = await detailFor(message);
      let insights =
        selected && messageKey(selected) === messageKey(detail)
          ? thread?.insights
          : null;
      if (detail.thread_id) {
        const contextThread = await api.threadDetail(
          detail.account_id,
          detail.thread_id,
        );
        setThread(contextThread);
        insights = contextThread.insights;
      } else {
        setThread(null);
      }
      setSelected(detail);
      showExistingInsight(action, insights);
      return;
'''
if old_ai not in text:
    raise SystemExit("AI insight block missing")
text = text.replace(old_ai, new_ai)

folder_old = '''                <button
                  type="button"
                  key={item.name}
                  className={`folderItem ${folder === item.name ? "active" : ""}`}
                  onClick={() => setFolder(item.name)}
                >'''
folder_new = '''                <button
                  type="button"
                  key={item.name}
                  className={`folderItem ${folder === item.name ? "active" : ""} ${dragTarget === item.name ? "dropTarget" : ""}`}
                  onClick={() => setFolder(item.name)}
                  onDragEnter={(event) => {
                    if (dragMessages.length === 0) return;
                    event.preventDefault();
                    setDragTarget(item.name);
                  }}
                  onDragOver={(event) => {
                    if (dragMessages.length === 0) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDragTarget(item.name);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                      setDragTarget((current) => current === item.name ? null : current);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    void dropMessagesIntoFolder(item.name);
                  }}
                >'''
if folder_old not in text:
    raise SystemExit("folder button anchor missing")
text = text.replace(folder_old, folder_new)

row_old = '''                  className={`messageRow ${!message.seen ? "unread" : ""} ${selected && messageKey(selected) === messageKey(message) ? "selected" : ""}`}
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
                >'''
row_new = '''                  className={`messageRow ${!message.seen ? "unread" : ""} ${selected && messageKey(selected) === messageKey(message) ? "selected" : ""} ${selectedKeys.has(messageKey(message)) ? "batchSelected" : ""}`}
                  draggable
                  aria-pressed={selectedKeys.has(messageKey(message))}
                  onClick={(event) => {
                    if (event.ctrlKey || event.metaKey) {
                      const key = messageKey(message);
                      setSelectedKeys((current) => {
                        const next = new Set(current);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      });
                      return;
                    }
                    setSelectedKeys(new Set());
                    void openMessage(message);
                  }}
                  onDragStart={(event) => {
                    const items = selectionForDrag(message);
                    setDragMessages(items);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", items.map(messageKey).join(","));
                  }}
                  onDragEnd={() => {
                    setDragMessages([]);
                    setDragTarget(null);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    void openContextMenuAt(message, {
                      x: Math.min(event.clientX, window.innerWidth - 210),
                      y: Math.min(event.clientY, window.innerHeight - 220),
                    });
                  }}
                >'''
if row_old not in text:
    raise SystemExit("message row anchor missing")
text = text.replace(row_old, row_new)

# Add touch/keyboard fallback in detail action row after Forward.
forward_anchor = '''                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => createReply("forward")}
                  >
                    Forward
                  </button>
'''
more_button = forward_anchor + '''                  <button
                    className="btn secondary"
                    type="button"
                    aria-label="More message actions"
                    onClick={() =>
                      void openContextMenuAt(selected, {
                        x: Math.max(8, window.innerWidth - 240),
                        y: 112,
                      })
                    }
                  >
                    …
                  </button>
'''
if forward_anchor not in text:
    raise SystemExit("forward button anchor missing")
text = text.replace(forward_anchor, more_button, 1)

# Right click inside individual visible message cards.
card_old = '''                  <article className="messageCard" key={messageKey(message)}>
'''
card_new = '''                  <article
                    className="messageCard"
                    key={messageKey(message)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      void openContextMenuAt(message, {
                        x: Math.min(event.clientX, window.innerWidth - 210),
                        y: Math.min(event.clientY, window.innerHeight - 220),
                      });
                    }}
                  >
'''
if card_old not in text:
    raise SystemExit("message card anchor missing")
text = text.replace(card_old, card_new)

menu_old = '''          capabilities={metadata?.capabilities}
'''
menu_new = '''          capabilities={contextMenu.capabilities}
'''
if menu_old not in text:
    raise SystemExit("context capabilities anchor missing")
text = text.replace(menu_old, menu_new, 1)

# Add undo toast before context menu rendering.
ui_anchor = '''      {contextMenu && (
'''
undo_ui = '''      {undoMoves.length > 0 && (
        <div className="undoToast" role="status">
          <span>
            Moved {undoMoves.length} message{undoMoves.length === 1 ? "" : "s"}.
          </span>
          <button type="button" onClick={() => void undoLastMove()} disabled={actionLoading}>
            Undo
          </button>
          <button type="button" aria-label="Dismiss undo" onClick={() => setUndoMoves([])}>
            ×
          </button>
        </div>
      )}

'''
if ui_anchor not in text:
    raise SystemExit("context menu UI anchor missing")
text = text.replace(ui_anchor, undo_ui + ui_anchor, 1)

css_anchor = '''        .aiResultBackdrop {
'''
css = '''        .messageRow.batchSelected { outline: 2px solid var(--primary); outline-offset: -2px; }
        .folderItem.dropTarget { outline: 2px solid var(--primary); background: color-mix(in srgb, var(--primary) 12%, transparent); }
        .undoToast { position:fixed; z-index:950; left:50%; bottom:22px; transform:translateX(-50%); display:flex; align-items:center; gap:.65rem; padding:.7rem .85rem; border:1px solid var(--border); border-radius:10px; background:var(--surface,var(--bg)); box-shadow:0 14px 40px rgba(0,0,0,.25); }
        .undoToast button { border:0; background:transparent; color:var(--primary); font-weight:600; cursor:pointer; }
'''
if css_anchor not in text:
    raise SystemExit("CSS anchor missing")
text = text.replace(css_anchor, css + css_anchor, 1)

path.write_text(text)
