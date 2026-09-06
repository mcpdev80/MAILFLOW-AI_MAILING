import type { en } from "./en";
import type { enDashboard } from "./en-dashboard";
import type { enMailActions } from "./en-mail-actions";
import type { enSearch } from "./en-search";
import type { enSettings } from "./en-settings";
import type { enShell } from "./en-shell";

export type TranslationKey =
  | keyof typeof en
  | keyof typeof enDashboard
  | keyof typeof enMailActions
  | keyof typeof enSearch
  | keyof typeof enSettings
  | keyof typeof enShell;
