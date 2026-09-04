/** MailFlow API DTOs (mirror of backend HTTP contracts). */

export type ActionMode = "off" | "review" | "automatic";

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
    | "interval_minutes"
    | "is_active"
    | "llm_provider_id"
    | "move_policy"
    | "archive_policy"
    | "action_confidence_threshold"
  >
> & { password?: string | null };

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
