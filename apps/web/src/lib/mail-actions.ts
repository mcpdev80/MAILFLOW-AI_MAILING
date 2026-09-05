export type MailActionGroup = "reply" | "ai" | "organize" | "more";

export type MailActionId =
  | "reply"
  | "reply_all"
  | "forward"
  | "ai_reply"
  | "ai_reply_short"
  | "ai_reply_friendly"
  | "ai_reply_professional"
  | "ai_reply_direct"
  | "ai_reply_custom"
  | "ai_summarize"
  | "ai_key_points"
  | "ai_todos"
  | "ai_questions"
  | "ai_deadlines"
  | "ai_translate_de"
  | "ai_translate_en"
  | "ai_translate_es"
  | "ai_translate_custom"
  | "ai_custom"
  | "move"
  | "archive"
  | "mark_read"
  | "mark_unread"
  | "flag"
  | "unflag"
  | "spam"
  | "trash"
  | "print_message"
  | "print_thread"
  | "message_details";

export interface MailActionDefinition {
  id: MailActionId;
  group: MailActionGroup;
  label: string;
  destructive?: boolean;
  ai?: boolean;
  capability?:
    | "read_state"
    | "flag"
    | "move"
    | "archive"
    | "trash"
    | "spam";
  submenu?: readonly MailActionDefinition[];
}

const AI_REPLY_ACTIONS: readonly MailActionDefinition[] = [
  { id: "ai_reply", group: "reply", label: "Write reply", ai: true },
  {
    id: "ai_reply_short",
    group: "reply",
    label: "Short reply",
    ai: true,
  },
  {
    id: "ai_reply_friendly",
    group: "reply",
    label: "Friendly reply",
    ai: true,
  },
  {
    id: "ai_reply_professional",
    group: "reply",
    label: "Professional reply",
    ai: true,
  },
  {
    id: "ai_reply_direct",
    group: "reply",
    label: "Direct reply",
    ai: true,
  },
  {
    id: "ai_reply_custom",
    group: "reply",
    label: "Custom instruction…",
    ai: true,
  },
];

const AI_ACTIONS: readonly MailActionDefinition[] = [
  { id: "ai_summarize", group: "ai", label: "Summarize", ai: true },
  { id: "ai_key_points", group: "ai", label: "Show key points", ai: true },
  { id: "ai_todos", group: "ai", label: "Extract to-dos", ai: true },
  {
    id: "ai_questions",
    group: "ai",
    label: "Detect open questions",
    ai: true,
  },
  {
    id: "ai_deadlines",
    group: "ai",
    label: "Detect deadlines / dates",
    ai: true,
  },
  {
    id: "ai_translate_custom",
    group: "ai",
    label: "Translate",
    ai: true,
    submenu: [
      { id: "ai_translate_de", group: "ai", label: "German", ai: true },
      { id: "ai_translate_en", group: "ai", label: "English", ai: true },
      { id: "ai_translate_es", group: "ai", label: "Spanish", ai: true },
      {
        id: "ai_translate_custom",
        group: "ai",
        label: "Other…",
        ai: true,
      },
    ],
  },
  { id: "ai_custom", group: "ai", label: "Custom instruction…", ai: true },
];

export const MAIL_ACTION_GROUPS: ReadonlyArray<{
  id: MailActionGroup;
  label: string;
  actions: readonly MailActionDefinition[];
}> = [
  {
    id: "reply",
    label: "Reply",
    actions: [
      { id: "reply", group: "reply", label: "Reply" },
      { id: "reply_all", group: "reply", label: "Reply all" },
      { id: "forward", group: "reply", label: "Forward" },
      {
        id: "ai_reply",
        group: "reply",
        label: "Reply with AI",
        ai: true,
        submenu: AI_REPLY_ACTIONS,
      },
    ],
  },
  { id: "ai", label: "AI", actions: AI_ACTIONS },
  {
    id: "organize",
    label: "Organize",
    actions: [
      { id: "move", group: "organize", label: "Move to…", capability: "move" },
      {
        id: "archive",
        group: "organize",
        label: "Archive",
        capability: "archive",
      },
      {
        id: "mark_read",
        group: "organize",
        label: "Mark read",
        capability: "read_state",
      },
      {
        id: "mark_unread",
        group: "organize",
        label: "Mark unread",
        capability: "read_state",
      },
      { id: "flag", group: "organize", label: "Star", capability: "flag" },
      {
        id: "unflag",
        group: "organize",
        label: "Remove star",
        capability: "flag",
      },
      { id: "spam", group: "organize", label: "Spam / junk", capability: "spam" },
      {
        id: "trash",
        group: "organize",
        label: "Delete",
        destructive: true,
        capability: "trash",
      },
    ],
  },
  {
    id: "more",
    label: "More",
    actions: [
      {
        id: "print_message",
        group: "more",
        label: "Print message",
      },
      { id: "print_thread", group: "more", label: "Print thread" },
      {
        id: "message_details",
        group: "more",
        label: "Message details / headers",
      },
    ],
  },
];
