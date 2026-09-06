import type { TranslationKey } from "@/lib/i18n";

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
  labelKey: TranslationKey;
  destructive?: boolean;
  ai?: boolean;
  capability?: "read_state" | "flag" | "move" | "archive" | "trash" | "spam";
  submenu?: readonly MailActionDefinition[];
}

const AI_REPLY_ACTIONS: readonly MailActionDefinition[] = [
  {
    id: "ai_reply",
    group: "reply",
    labelKey: "mail.action.ai_reply_write",
    ai: true,
  },
  {
    id: "ai_reply_short",
    group: "reply",
    labelKey: "mail.action.ai_reply_short",
    ai: true,
  },
  {
    id: "ai_reply_friendly",
    group: "reply",
    labelKey: "mail.action.ai_reply_friendly",
    ai: true,
  },
  {
    id: "ai_reply_professional",
    group: "reply",
    labelKey: "mail.action.ai_reply_professional",
    ai: true,
  },
  {
    id: "ai_reply_direct",
    group: "reply",
    labelKey: "mail.action.ai_reply_direct",
    ai: true,
  },
  {
    id: "ai_reply_custom",
    group: "reply",
    labelKey: "mail.action.ai_reply_custom",
    ai: true,
  },
];

const AI_ACTIONS: readonly MailActionDefinition[] = [
  {
    id: "ai_summarize",
    group: "ai",
    labelKey: "mail.action.ai_summarize",
    ai: true,
  },
  {
    id: "ai_key_points",
    group: "ai",
    labelKey: "mail.action.ai_key_points",
    ai: true,
  },
  { id: "ai_todos", group: "ai", labelKey: "mail.action.ai_todos", ai: true },
  {
    id: "ai_questions",
    group: "ai",
    labelKey: "mail.action.ai_questions",
    ai: true,
  },
  {
    id: "ai_deadlines",
    group: "ai",
    labelKey: "mail.action.ai_deadlines",
    ai: true,
  },
  {
    id: "ai_translate_custom",
    group: "ai",
    labelKey: "mail.action.ai_translate",
    ai: true,
    submenu: [
      {
        id: "ai_translate_de",
        group: "ai",
        labelKey: "mail.action.ai_translate_de",
        ai: true,
      },
      {
        id: "ai_translate_en",
        group: "ai",
        labelKey: "mail.action.ai_translate_en",
        ai: true,
      },
      {
        id: "ai_translate_es",
        group: "ai",
        labelKey: "mail.action.ai_translate_es",
        ai: true,
      },
      {
        id: "ai_translate_custom",
        group: "ai",
        labelKey: "mail.action.ai_translate_other",
        ai: true,
      },
    ],
  },
  { id: "ai_custom", group: "ai", labelKey: "mail.action.ai_custom", ai: true },
];

export const MAIL_ACTION_GROUPS: ReadonlyArray<{
  id: MailActionGroup;
  labelKey: TranslationKey;
  actions: readonly MailActionDefinition[];
}> = [
  {
    id: "reply",
    labelKey: "mail.group.reply",
    actions: [
      { id: "reply", group: "reply", labelKey: "mail.action.reply" },
      { id: "reply_all", group: "reply", labelKey: "mail.action.reply_all" },
      { id: "forward", group: "reply", labelKey: "mail.action.forward" },
      {
        id: "ai_reply",
        group: "reply",
        labelKey: "mail.action.ai_reply",
        ai: true,
        submenu: AI_REPLY_ACTIONS,
      },
    ],
  },
  { id: "ai", labelKey: "mail.group.ai", actions: AI_ACTIONS },
  {
    id: "organize",
    labelKey: "mail.group.organize",
    actions: [
      {
        id: "move",
        group: "organize",
        labelKey: "mail.action.move",
        capability: "move",
      },
      {
        id: "archive",
        group: "organize",
        labelKey: "mail.action.archive",
        capability: "archive",
      },
      {
        id: "mark_read",
        group: "organize",
        labelKey: "mail.action.mark_read",
        capability: "read_state",
      },
      {
        id: "mark_unread",
        group: "organize",
        labelKey: "mail.action.mark_unread",
        capability: "read_state",
      },
      {
        id: "flag",
        group: "organize",
        labelKey: "mail.action.flag",
        capability: "flag",
      },
      {
        id: "unflag",
        group: "organize",
        labelKey: "mail.action.unflag",
        capability: "flag",
      },
      {
        id: "spam",
        group: "organize",
        labelKey: "mail.action.spam",
        capability: "spam",
        destructive: true,
      },
      {
        id: "trash",
        group: "organize",
        labelKey: "mail.action.trash",
        capability: "trash",
        destructive: true,
      },
    ],
  },
  {
    id: "more",
    labelKey: "mail.group.more",
    actions: [
      {
        id: "print_message",
        group: "more",
        labelKey: "mail.action.print_message",
      },
      {
        id: "print_thread",
        group: "more",
        labelKey: "mail.action.print_thread",
      },
      {
        id: "message_details",
        group: "more",
        labelKey: "mail.action.message_details",
      },
    ],
  },
];
