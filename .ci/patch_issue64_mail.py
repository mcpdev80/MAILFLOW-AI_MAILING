from pathlib import Path

path = Path("apps/web/src/app/app/mail/page.tsx")
text = path.read_text()

text = text.replace(
    'import { ApiError, api, mailAttachmentUrl } from "@/lib/api";\n',
    'import { MailContextMenu, type ContextMenuPosition } from "@/components/mail-context-menu";\n'
    'import { ApiError, api, mailAttachmentUrl } from "@/lib/api";\n'
    'import type { MailActionId } from "@/lib/mail-actions";\n',
)

text = text.replace(
    '  const [error, setError] = useState<string | null>(null);\n',
    '  const [error, setError] = useState<string | null>(null);\n'
    '  const [contextMenu, setContextMenu] = useState<{\n'
    '    position: ContextMenuPosition;\n'
    '    message: InboxMessage;\n'
    '  } | null>(null);\n'
    '  const [aiResult, setAiResult] = useState<{ title: string; body: string } | null>(null);\n',
)

needle = '''  async function runAction(payload: MailActionRequest) {
    if (!selected) return;
'''
replacement = '''  async function detailFor(message: InboxMessage): Promise<MessageDetail> {
    if (selected && messageKey(selected) === messageKey(message)) return selected;
    return api.messageDetail(message.account_id, message.folder, message.uid);
  }

  async function runActionFor(message: InboxMessage, payload: MailActionRequest) {
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
      await api.mailAction(message.account_id, message.folder, message.uid, payload);
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
'''
if needle not in text:
    raise SystemExit("runAction anchor missing")
text = text.replace(needle, replacement)

text = text.replace(
    '  async function createReply(type: "reply" | "reply_all" | "forward") {\n    if (!selected) return;\n',
    '  async function createReply(\n'
    '    type: "reply" | "reply_all" | "forward",\n'
    '    source: MessageDetail | null = selected,\n'
    '    aiAction?: MailActionId,\n'
    '  ) {\n'
    '    if (!source) return;\n',
)
text = text.replace('      const references = Array.from(\n        new Set([...selected.references, selected.message_id].filter(Boolean)),\n      );\n      const ownAddress = selected.account_address;\n', '      const references = Array.from(\n        new Set([...source.references, source.message_id].filter(Boolean)),\n      );\n      const ownAddress = source.account_address;\n')
for old, new in [
    ('toRecipients = [selected.from_email];', 'toRecipients = [source.from_email];'),
    ('[selected.from_email, ...selected.to_emails]', '[source.from_email, ...source.to_emails]'),
    ('safeRecipients(selected.cc_emails, ownAddress)', 'safeRecipients(source.cc_emails, ownAddress)'),
    ('`From: ${selected.from_email}`', '`From: ${source.from_email}`'),
    ('`Date: ${selected.date ?? ""}`', '`Date: ${source.date ?? ""}`'),
    ('`Subject: ${selected.subject}`', '`Subject: ${source.subject}`'),
    ('`To: ${selected.to_emails.join(", ")}`', '`To: ${source.to_emails.join(", ")}`'),
    ('selected.body_text,', 'source.body_text,'),
    ('account_id: selected.account_id,', 'account_id: source.account_id,'),
    ('in_reply_to: type === "forward" ? null : selected.message_id,', 'in_reply_to: type === "forward" ? null : source.message_id,'),
    ('selected.subject,\n          type === "forward" ? "Fwd:" : "Re:",', 'source.subject,\n          type === "forward" ? "Fwd:" : "Re:",'),
]:
    text = text.replace(old, new)

anchor = '      const draft = await api.createDraft({\n'
# Insert AI application after draft creation block just before router.push.
old = '      });\n      router.push(`/app/compose?draft=${encodeURIComponent(draft.id)}`);\n'
new = '''      });
      if (aiAction && aiAction.startsWith("ai_reply")) {
        const instructionByAction: Partial<Record<MailActionId, string>> = {
          ai_reply: "Write a helpful reply to the sender in the sender's language.",
          ai_reply_short: "Write a concise reply. Keep only what is necessary.",
          ai_reply_friendly: "Write a warm, friendly reply.",
          ai_reply_professional: "Write a professional, polished reply.",
          ai_reply_direct: "Write a direct, clear reply without unnecessary filler.",
        };
        let instruction = instructionByAction[aiAction] ?? "";
        if (aiAction === "ai_reply_custom") {
          instruction = window.prompt("How should AI write the reply?")?.trim() ?? "";
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
'''
if old not in text:
    raise SystemExit("draft router anchor missing")
text = text.replace(old, new, 1)

insert_before = '  function promptTag(action: "add_tags" | "remove_tags") {\n'
context_helpers = '''  function showExistingInsight(action: MailActionId) {
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
      setAiResult({ title: "Key points", body: insights.key_points.join("\n• ") || "No key points detected." });
    else if (action === "ai_todos")
      setAiResult({ title: "To-dos", body: insights.todos.join("\n• ") || "No to-dos detected." });
    else if (action === "ai_questions")
      setAiResult({ title: "Open questions", body: insights.open_questions.join("\n• ") || "No open questions detected." });
    else if (action === "ai_deadlines")
      setAiResult({ title: "Deadlines / dates", body: insights.deadline || "No deadline detected." });
  }

  async function executeContextAction(action: MailActionId, message: InboxMessage) {
    if (action === "reply" || action === "reply_all" || action === "forward") {
      await createReply(action, await detailFor(message));
      return;
    }
    if (action.startsWith("ai_reply")) {
      await createReply("reply", await detailFor(message), action);
      return;
    }
    if (["ai_summarize", "ai_key_points", "ai_todos", "ai_questions", "ai_deadlines"].includes(action)) {
      const detail = await detailFor(message);
      if (!selected || messageKey(selected) !== messageKey(detail)) await openMessage(message);
      showExistingInsight(action);
      return;
    }
    if (action.startsWith("ai_translate_") || action === "ai_custom") {
      const detail = await detailFor(message);
      const language = action === "ai_translate_de" ? "German" : action === "ai_translate_en" ? "English" : action === "ai_translate_es" ? "Spanish" : "";
      const custom = language || window.prompt(action === "ai_custom" ? "What should AI do with this message?" : "Translate to which language?")?.trim();
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
      setAiResult({ title: language ? `Translation · ${language}` : "AI result", body: preview.content });
      await api.discardDraft(draft.id);
      return;
    }
    if (action === "mark_read") return runActionFor(message, { action: "mark_read" });
    if (action === "mark_unread") return runActionFor(message, { action: "mark_unread" });
    if (action === "flag") return runActionFor(message, { action: "flag" });
    if (action === "unflag") return runActionFor(message, { action: "unflag" });
    if (action === "archive") return runActionFor(message, { action: "archive" });
    if (action === "spam") return runActionFor(message, { action: "spam" });
    if (action === "trash") return runActionFor(message, { action: "trash" });
    if (action === "move") {
      const meta = await ensureMetadata(message.account_id);
      const names = meta.folders.filter((item) => item.selectable && item.name !== message.folder).map((item) => item.name);
      const destination = window.prompt(`Move to folder:\n${names.join("\n")}`)?.trim();
      if (destination && names.includes(destination))
        await runActionFor(message, { action: "move", destination_folder: destination });
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
      window.open(`/app/mail/print?${params.toString()}`, "_blank", "noopener,noreferrer");
      return;
    }
    if (action === "message_details") {
      const detail = await detailFor(message);
      setAiResult({
        title: "Message details",
        body: [`Message-ID: ${detail.message_id}`, `From: ${detail.from_email}`, `To: ${detail.to_emails.join(", ")}`, `Folder: ${detail.folder}`, `UID: ${detail.uid}`].join("\n"),
      });
    }
  }

'''
if insert_before not in text:
    raise SystemExit("tag anchor missing")
text = text.replace(insert_before, context_helpers + insert_before)

# Add context menu handler to message row button.
old_row = '''                  onClick={() => openMessage(message)}
                >'''
new_row = '''                  onClick={() => openMessage(message)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({
                      position: { x: Math.min(event.clientX, window.innerWidth - 210), y: Math.min(event.clientY, window.innerHeight - 220) },
                      message,
                    });
                  }}
                >'''
if old_row not in text:
    raise SystemExit("message row anchor missing")
text = text.replace(old_row, new_row, 1)

# Add menu and result modal before style.
style_anchor = '      <style jsx>{`\n'
ui = '''      {contextMenu && (
        <MailContextMenu
          position={contextMenu.position}
          capabilities={metadata?.capabilities}
          seen={contextMenu.message.seen}
          flagged={contextMenu.message.flagged}
          onClose={() => setContextMenu(null)}
          onAction={(action) => executeContextAction(action, contextMenu.message)}
        />
      )}

      {aiResult && (
        <div className="aiResultBackdrop" role="presentation" onClick={() => setAiResult(null)}>
          <section className="aiResultDialog" role="dialog" aria-modal="true" aria-label={aiResult.title} onClick={(event) => event.stopPropagation()}>
            <header>
              <strong>{aiResult.title}</strong>
              <button type="button" onClick={() => setAiResult(null)} aria-label="Close">×</button>
            </header>
            <pre>{aiResult.body}</pre>
          </section>
        </div>
      )}

'''
if style_anchor not in text:
    raise SystemExit("style anchor missing")
text = text.replace(style_anchor, ui + style_anchor, 1)

# Add CSS before final media section.
css_anchor = '        @media (max-width: 1000px) {\n'
css = '''        .aiResultBackdrop { position:fixed; inset:0; z-index:900; background:rgba(0,0,0,.36); display:grid; place-items:center; padding:1rem; }
        .aiResultDialog { width:min(680px,100%); max-height:80vh; overflow:auto; border:1px solid var(--border); border-radius:12px; background:var(--surface,var(--bg)); box-shadow:0 20px 60px rgba(0,0,0,.28); }
        .aiResultDialog header { display:flex; justify-content:space-between; align-items:center; padding:.8rem 1rem; border-bottom:1px solid var(--border); }
        .aiResultDialog header button { border:0; background:transparent; color:inherit; font-size:1.3rem; cursor:pointer; }
        .aiResultDialog pre { margin:0; padding:1rem; white-space:pre-wrap; font:inherit; line-height:1.55; }
'''
if css_anchor not in text:
    raise SystemExit("css anchor missing")
text = text.replace(css_anchor, css + css_anchor, 1)

path.write_text(text)
