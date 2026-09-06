import type { en } from "./en";
import type { enAccount } from "./en-account";
import type { enCompose } from "./en-compose";
import type { enDashboard } from "./en-dashboard";
import type { enDecision } from "./en-decision";
import type { enMail } from "./en-mail";
import type { enMailActions } from "./en-mail-actions";
import type { enNotifications } from "./en-notifications";
import type { enSearch } from "./en-search";
import type { enSettings } from "./en-settings";
import type { enShell } from "./en-shell";

export type TranslationKey =
  | keyof typeof en
  | keyof typeof enAccount
  | keyof typeof enCompose
  | keyof typeof enDashboard
  | keyof typeof enDecision
  | keyof typeof enMail
  | keyof typeof enMailActions
  | keyof typeof enNotifications
  | keyof typeof enSearch
  | keyof typeof enSettings
  | keyof typeof enShell;
