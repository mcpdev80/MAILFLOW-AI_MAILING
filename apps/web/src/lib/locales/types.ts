import type { en } from "./en";
import type { enAccount } from "./en-account";
import type { enAuth } from "./en-auth";
import type { enBilling } from "./en-billing";
import type { enCompose } from "./en-compose";
import type { enDashboard } from "./en-dashboard";
import type { enDecision } from "./en-decision";
import type { enDrafts } from "./en-drafts";
import type { enHome } from "./en-home";
import type { enMail } from "./en-mail";
import type { enMailActions } from "./en-mail-actions";
import type { enMembers } from "./en-members";
import type { enModelSettings } from "./en-model-settings";
import type { enNotifications } from "./en-notifications";
import type { enOnboarding } from "./en-onboarding";
import type { enSearch } from "./en-search";
import type { enSecurity } from "./en-security";
import type { enSettings } from "./en-settings";
import type { enShell } from "./en-shell";

export type TranslationKey =
  | keyof typeof en
  | keyof typeof enAccount
  | keyof typeof enAuth
  | keyof typeof enBilling
  | keyof typeof enCompose
  | keyof typeof enDashboard
  | keyof typeof enDecision
  | keyof typeof enDrafts
  | keyof typeof enHome
  | keyof typeof enMail
  | keyof typeof enMailActions
  | keyof typeof enMembers
  | keyof typeof enModelSettings
  | keyof typeof enNotifications
  | keyof typeof enOnboarding
  | keyof typeof enSearch
  | keyof typeof enSecurity
  | keyof typeof enSettings
  | keyof typeof enShell;
