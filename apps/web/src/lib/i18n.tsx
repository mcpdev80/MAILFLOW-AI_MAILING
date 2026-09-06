"use client";

import { api } from "@/lib/api";
import { getBootstrapStatus } from "@/lib/bootstrap-api";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { de } from "./locales/de";
import { deAccount } from "./locales/de-account";
import { deAuth } from "./locales/de-auth";
import { deBilling } from "./locales/de-billing";
import { deCompose } from "./locales/de-compose";
import { deDashboard } from "./locales/de-dashboard";
import { deDecision } from "./locales/de-decision";
import { deDrafts } from "./locales/de-drafts";
import { deHome } from "./locales/de-home";
import { deMail } from "./locales/de-mail";
import { deMailActions } from "./locales/de-mail-actions";
import { deMembers } from "./locales/de-members";
import { deModelSettings } from "./locales/de-model-settings";
import { deNotifications } from "./locales/de-notifications";
import { deOnboarding } from "./locales/de-onboarding";
import { deOperations } from "./locales/de-operations";
import { deSearch } from "./locales/de-search";
import { deSecurity } from "./locales/de-security";
import { deSettings } from "./locales/de-settings";
import { deShell } from "./locales/de-shell";
import { en } from "./locales/en";
import { enAccount } from "./locales/en-account";
import { enAuth } from "./locales/en-auth";
import { enBilling } from "./locales/en-billing";
import { enCompose } from "./locales/en-compose";
import { enDashboard } from "./locales/en-dashboard";
import { enDecision } from "./locales/en-decision";
import { enDrafts } from "./locales/en-drafts";
import { enHome } from "./locales/en-home";
import { enMail } from "./locales/en-mail";
import { enMailActions } from "./locales/en-mail-actions";
import { enMembers } from "./locales/en-members";
import { enModelSettings } from "./locales/en-model-settings";
import { enNotifications } from "./locales/en-notifications";
import { enOnboarding } from "./locales/en-onboarding";
import { enOperations } from "./locales/en-operations";
import { enSearch } from "./locales/en-search";
import { enSecurity } from "./locales/en-security";
import { enSettings } from "./locales/en-settings";
import { enShell } from "./locales/en-shell";
import { es } from "./locales/es";
import { esAccount } from "./locales/es-account";
import { esAuth } from "./locales/es-auth";
import { esBilling } from "./locales/es-billing";
import { esCompose } from "./locales/es-compose";
import { esDashboard } from "./locales/es-dashboard";
import { esDecision } from "./locales/es-decision";
import { esDrafts } from "./locales/es-drafts";
import { esHome } from "./locales/es-home";
import { esMail } from "./locales/es-mail";
import { esMailActions } from "./locales/es-mail-actions";
import { esMembers } from "./locales/es-members";
import { esModelSettings } from "./locales/es-model-settings";
import { esNotifications } from "./locales/es-notifications";
import { esOnboarding } from "./locales/es-onboarding";
import { esOperations } from "./locales/es-operations";
import { esSearch } from "./locales/es-search";
import { esSecurity } from "./locales/es-security";
import { esSettings } from "./locales/es-settings";
import { esShell } from "./locales/es-shell";
import type { TranslationKey } from "./locales/types";

export type { TranslationKey } from "./locales/types";
export type Locale = "de" | "en" | "es";

export const LOCALES: readonly Locale[] = ["de", "en", "es"];
export const LOCALE_NAMES: Record<Locale, string> = {
  de: "Deutsch",
  en: "English",
  es: "Español",
};

const fallback = {
  ...en,
  ...enAccount,
  ...enAuth,
  ...enBilling,
  ...enCompose,
  ...enDashboard,
  ...enDecision,
  ...enDrafts,
  ...enHome,
  ...enMail,
  ...enMailActions,
  ...enMembers,
  ...enModelSettings,
  ...enNotifications,
  ...enOnboarding,
  ...enOperations,
  ...enSearch,
  ...enSecurity,
  ...enSettings,
  ...enShell,
};
const catalogs: Record<Locale, Partial<Record<TranslationKey, string>>> = {
  de: {
    ...de,
    ...deAccount,
    ...deAuth,
    ...deBilling,
    ...deCompose,
    ...deDashboard,
    ...deDecision,
    ...deDrafts,
    ...deHome,
    ...deMail,
    ...deMailActions,
    ...deMembers,
    ...deModelSettings,
    ...deNotifications,
    ...deOnboarding,
    ...deOperations,
    ...deSearch,
    ...deSecurity,
    ...deSettings,
    ...deShell,
  },
  en: fallback,
  es: {
    ...es,
    ...esAccount,
    ...esAuth,
    ...esBilling,
    ...esCompose,
    ...esDashboard,
    ...esDecision,
    ...esDrafts,
    ...esHome,
    ...esMail,
    ...esMailActions,
    ...esMembers,
    ...esModelSettings,
    ...esNotifications,
    ...esOnboarding,
    ...esOperations,
    ...esSearch,
    ...esSecurity,
    ...esSettings,
    ...esShell,
  },
};

export function detectBrowserLocale(languages?: readonly string[]): Locale {
  const candidates =
    languages ??
    (typeof navigator !== "undefined"
      ? navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language]
      : []);
  for (const value of candidates) {
    const normalized = value.toLowerCase();
    if (normalized === "de" || normalized.startsWith("de-")) return "de";
    if (normalized === "es" || normalized.startsWith("es-")) return "es";
    if (normalized === "en" || normalized.startsWith("en-")) return "en";
  }
  return "en";
}

type I18nContextValue = {
  locale: Locale;
  ready: boolean;
  t: (key: TranslationKey) => string;
  setLocale: (locale: Locale) => Promise<void>;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const LOCAL_KEY = "mailflow.locale";

function asLocale(value: string | null | undefined): Locale | null {
  return value && LOCALES.includes(value as Locale) ? (value as Locale) : null;
}

function applyLocale(locale: Locale): void {
  window.localStorage.setItem(LOCAL_KEY, locale);
  document.documentElement.lang = locale;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const browserLocale = detectBrowserLocale();
    const cached = asLocale(window.localStorage.getItem(LOCAL_KEY));

    void Promise.allSettled([api.getUserPreferences(), getBootstrapStatus()]).then(
      async ([preferencesResult, bootstrapResult]) => {
        if (!active) return;

        const deploymentLocale =
          bootstrapResult.status === "fulfilled"
            ? asLocale(bootstrapResult.value.fields.language.value)
            : null;
        const firstRunLocale = cached ?? deploymentLocale ?? browserLocale;

        if (
          preferencesResult.status === "fulfilled" &&
          preferencesResult.value.locale_configured
        ) {
          const userLocale = preferencesResult.value.locale;
          setLocaleState(userLocale);
          applyLocale(userLocale);
          setReady(true);
          return;
        }

        setLocaleState(firstRunLocale);
        applyLocale(firstRunLocale);

        if (preferencesResult.status === "fulfilled") {
          try {
            await api.updateUserPreferences({ locale: firstRunLocale });
          } catch {
            // Keep the selected first-run locale locally if persistence is unavailable.
          }
        }
        if (active) setReady(true);
      },
    );

    return () => {
      active = false;
    };
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    applyLocale(next);
    try {
      await api.updateUserPreferences({ locale: next });
    } catch {
      // Keep the local choice for signed-out/offline surfaces; it will sync later.
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      ready,
      t: (key) => catalogs[locale][key] ?? fallback[key],
      setLocale,
    }),
    [locale, ready, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export function enumLabel(
  t: (key: TranslationKey) => string,
  group: "category" | "importance" | "urgency" | "action_required",
  value: string,
): string {
  const key = `${group}.${value}` as TranslationKey;
  return key in en ? t(key) : value;
}
