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

export interface CycleEnqueued {
  account_id: string;
  enqueued: boolean;
  job_id: string | null;
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
