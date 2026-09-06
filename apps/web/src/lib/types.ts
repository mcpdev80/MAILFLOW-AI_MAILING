/** MailFlow API DTOs (mirror of backend HTTP contracts). */

export type ActionMode = "off" | "review" | "automatic";
export type SmtpSecurity = "ssl" | "starttls" | "plain";
export type MessageType = "new" | "reply" | "reply_all" | "forward";
export type EditorMode = "rich_text" | "markdown";
export type DraftStatus = "draft" | "sending" | "sent" | "failed" | "discarded";
export type WritingAction =
  | "draft_reply"
  | "draft_from_points"
  | "improve"
  | "shorten"
  | "expand"
  | "friendlier"
  | "professional"
  | "direct"
  | "formal"
  | "informal"
  | "proofread"
  | "translate"
  | "same_language"
  | "custom";
export type WritingScope = "full" | "selection";
export type MailActionName =
  | "mark_read"
  | "mark_unread"
  | "flag"
  | "unflag"
  | "move"
  | "archive"
  | "trash"
  | "spam"
  | "restore"
  | "add_tags"
  | "remove_tags";

export interface EmailAccount {
  id: string;
  org_id: string;
  owner_user_id: string | null;
  ownership_mode: "private" | "shared" | "unresolved";
  provider_type: string;
  imap_host: string;
  imap_port: number;
  use_ssl: boolean;
  username: string;
  inbox_folder: string;
  unclassified_folder: string;
  drafts_folder: string;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_security: SmtpSecurity;
  smtp_username: string | null;
  has_smtp_password: boolean;
  interval_minutes: number;
  is_active: boolean;
  last_cycle_at: string | null;
  llm_provider_id: string | null;
  move_policy: ActionMode;
  archive_policy: ActionMode;
  action_confidence_threshold: number;
  created_at: string;
}

export interface EmailAccountCreate {
  imap_host: string;
  imap_port?: number;
  use_ssl?: boolean;
  username: string;
  password: string;
  interval_minutes?: number;
  llm_provider_id?: string | null;
  ownership_mode?: "private" | "shared";
  shared_user_ids?: string[];
  move_policy?: ActionMode;
  archive_policy?: ActionMode;
  action_confidence_threshold?: number;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_security?: SmtpSecurity;
  smtp_username?: string | null;
  smtp_password?: string | null;
}

export type EmailAccountUpdate = Partial<
  Pick<
    EmailAccount,
    | "imap_host"
    | "imap_port"
    | "use_ssl"
    | "username"
    | "inbox_folder"
    | "unclassified_folder"
    | "drafts_folder"
    | "smtp_host"
    | "smtp_port"
    | "smtp_security"
    | "smtp_username"
    | "interval_minutes"
    | "is_active"
    | "llm_provider_id"
    | "move_policy"
    | "archive_policy"
    | "action_confidence_threshold"
  >
> & { password?: string | null; smtp_password?: string | null };

export interface DraftAttachment {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export interface MailDraft {
  id: string;
  org_id: string;
  account_id: string;
  owner_user_id: string | null;
  message_type: MessageType;
  in_reply_to: string | null;
  references: string[];
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  body_text: string;
  body_html: string | null;
  editor_mode: EditorMode;
  status: DraftStatus;
  send_attempts: number;
  sent_message_id: string | null;
  last_error: string | null;
  attachments: DraftAttachment[];
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

export interface DraftCreate {
  account_id: string;
  message_type?: MessageType;
  in_reply_to?: string | null;
  references?: string[];
  to_recipients?: string[];
  cc_recipients?: string[];
  bcc_recipients?: string[];
  subject?: string;
  body_text?: string;
  body_html?: string | null;
  editor_mode?: EditorMode;
}

export type DraftUpdate = Partial<Omit<DraftCreate, "account_id">> & {
  account_id?: string;
};

export interface DraftAttachmentCreate {
  filename: string;
  content_type: string;
  content_base64: string;
}

export interface WritingRequest {
  action: WritingAction;
  scope?: WritingScope;
  selected_text?: string | null;
  instruction?: string | null;
  target_language?: string | null;
}

export interface WritingPreview {
  action: WritingAction;
  scope: WritingScope;
  text: string;
  used_thread_context: boolean;
  used_current_message: boolean;
}

export interface PreSendCheck {
  warning_codes: string[];
  can_send: boolean;
}

export interface SendResult {
  draft_id: string;
  status: DraftStatus;
  message_id: string | null;
  warning_codes: string[];
}

export interface MailAttachment {
  part_id: string;
  filename: string;
  mime_type: string;
  size: number | null;
}

export interface MailboxCapabilities {
  read_state: boolean;
  flag: boolean;
  move: boolean;
  archive: boolean;
  trash: boolean;
  spam: boolean;
  restore: boolean;
  tags: boolean;
  attachments: boolean;
}

export interface MailboxFolderView {
  name: string;
  role: string | null;
  selectable: boolean;
}

export interface MailboxMetadata {
  capabilities: MailboxCapabilities;
  folders: MailboxFolderView[];
}

export interface MailboxCounter {
  account_id: string;
  account_address: string;
  folder: string;
  total: number;
  unread: number;
}

export interface InboxMessage {
  account_id: string;
  account_address: string;
  ownership_mode: string;
  uid: number;
  folder: string;
  message_id: string;
  thread_id: string | null;
  subject: string;
  from_email: string;
  to_emails: string[];
  cc_emails: string[];
  date: string | null;
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  keywords: string[];
  attachments: MailAttachment[];
}

export interface UnifiedInbox {
  messages: InboxMessage[];
  counters: MailboxCounter[];
  total_unread: number;
  next_before_uid_by_account: Record<string, number>;
}

export interface MessageDetail extends InboxMessage {
  body_text: string;
  safe_html: string | null;
  in_reply_to: string | null;
  references: string[];
}

export interface ThreadInsights {
  overview: string;
  key_points: string[];
  todos: string[];
  open_questions: string[];
  open_action_required: boolean;
  deadline: string | null;
}

export interface ThreadView {
  account_id: string;
  thread_id: string;
  messages: MessageDetail[];
  insights: ThreadInsights | null;
}

export interface MailActionRequest {
  action: MailActionName;
  destination_folder?: string | null;
  tags?: string[];
}

export interface MailActionResult {
  action: MailActionName;
  applied: boolean;
  destination_folder: string | null;
}

export interface SharedMailboxAccess {
  user_id: string;
  can_use: boolean;
  can_manage: boolean;
}

export interface MailboxOwnershipUpdate {
  mode: "private" | "shared";
  target_owner_user_id?: string | null;
  shared_user_ids?: string[];
}

export interface LLMProvider {
  id: string;
  org_id: string;
  label: string;
  type: string;
  base_url: string;
  default_classification_model: string;
  default_generation_model: string;
  fast_classification_model: string | null;
  deep_classification_model: string | null;
  generation_model: string | null;
  fast_classification_base_url: string | null;
  deep_classification_base_url: string | null;
  generation_base_url: string | null;
  is_active: boolean;
  has_api_key: boolean;
  has_fast_api_key: boolean;
  has_deep_api_key: boolean;
  has_generation_api_key: boolean;
  created_at: string;
}

export interface LLMProviderCreate {
  label: string;
  type: string;
  base_url: string;
  api_key?: string | null;
  default_classification_model?: string | null;
  default_generation_model?: string | null;
  fast_classification_model?: string | null;
  deep_classification_model?: string | null;
  generation_model?: string | null;
  fast_classification_base_url?: string | null;
  deep_classification_base_url?: string | null;
  generation_base_url?: string | null;
  fast_api_key?: string | null;
  deep_api_key?: string | null;
  generation_api_key?: string | null;
}

export type LLMProviderUpdate = Partial<LLMProviderCreate> & {
  is_active?: boolean;
};

export interface Cycle {
  id: string;
  account_id: string;
  cycle_id: string;
  emails_processed: number;
  drafts_saved: number;
  error_count: number;
  error_detail: string | null;
  duration_ms: number | null;
  created_at: string;
  finalized_at: string | null;
}

export type UserLocale = "de" | "en" | "es";
export type Theme = "light" | "dark" | "system";
export type Density = "comfortable" | "compact";
export type WorkspaceLayout =
  | "classic"
  | "vertical"
  | "focus"
  | "compact"
  | "wide"
  | "custom";
export type SidePanelAlignment = "left" | "right";
export type WorkspacePanel =
  | "accounts"
  | "folders"
  | "message_list"
  | "message_content";
export type WorkspaceDock = "left" | "center" | "right" | "top" | "bottom";
export type ActionBarDock = "top" | "bottom";
export type SystemStatusPosition = "top" | "bottom" | "hidden";

export interface WorkspacePanelConfig {
  panel: WorkspacePanel;
  dock: WorkspaceDock;
  order: number;
  size_px: number | null;
  visible: boolean;
}

export interface WorkspaceCustomConfig {
  version: 1;
  panels: WorkspacePanelConfig[];
  message_content_overlay: boolean;
  show_resize_handles: boolean;
  action_bar_dock: ActionBarDock;
  system_status_position: SystemStatusPosition;
}

export interface UserPreferences {
  locale: UserLocale;
  locale_configured: boolean;
  theme: Theme;
  density: Density;
  workspace_layout: WorkspaceLayout;
  side_panel_alignment: SidePanelAlignment;
  workspace_custom_config: WorkspaceCustomConfig | null;
}

export interface UserPreferencesUpdate {
  locale?: UserLocale;
  theme?: Theme;
  density?: Density;
  workspace_layout?: WorkspaceLayout;
  side_panel_alignment?: SidePanelAlignment;
  workspace_custom_config?: WorkspaceCustomConfig;
}

export interface CycleEnqueued {
  account_id: string;
  enqueued: boolean;
  job_id: string | null;
}

export type DecisionMemoryCategory =
  | "work"
  | "private"
  | "finance"
  | "orders"
  | "appointments"
  | "newsletters"
  | "notifications"
  | "other";

export type DecisionMemoryImportance =
  | "critical"
  | "high"
  | "normal"
  | "low"
  | "unknown";

export type DecisionMemoryUrgency =
  | "immediate"
  | "today"
  | "this_week"
  | "none"
  | "unknown";

export type DecisionMemoryActionRequired = "yes" | "no" | "unknown";
export type DecisionMemoryTrustedSource = "human_confirmed" | "human_corrected";

export interface DecisionMemoryEntry {
  id: string;
  account_id: string;
  sender_email: string | null;
  sender_domain: string | null;
  subject_pattern: string | null;
  thread_id: string | null;
  category: DecisionMemoryCategory;
  subcategory: string | null;
  importance: DecisionMemoryImportance;
  urgency: DecisionMemoryUrgency;
  action_required: DecisionMemoryActionRequired;
  system_tags: string[];
  user_tags: string[];
  routing_target: string | null;
  source: DecisionMemoryTrustedSource | "ai_observed";
  trust_score: number;
  enabled: boolean;
  hit_count: number;
  last_used: string | null;
  superseded_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DecisionMemoryWrite {
  sender_email: string | null;
  sender_domain: string | null;
  subject_pattern: string | null;
  thread_id: string | null;
  category: DecisionMemoryCategory;
  subcategory: string | null;
  importance: DecisionMemoryImportance;
  urgency: DecisionMemoryUrgency;
  action_required: DecisionMemoryActionRequired;
  system_tags: string[];
  user_tags: string[];
  routing_target: string | null;
  source: DecisionMemoryTrustedSource;
  trust_score: number;
  enabled: boolean;
}

export interface PlanStatus {
  plan: string;
  label: string;
  seats: number;
  max_accounts: number | null;
  max_emails_per_day: number | null;
  accounts_used: number;
  emails_today: number;
  billing_enabled: boolean;
}
