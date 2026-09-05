"use client";

import { api } from "@/lib/api";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Locale = "de" | "en" | "es";

export const LOCALES: readonly Locale[] = ["de", "en", "es"];
export const LOCALE_NAMES: Record<Locale, string> = {
  de: "Deutsch",
  en: "English",
  es: "Español",
};

const en = {
  "nav.dashboard": "Dashboard",
  "nav.billing": "Billing",
  "nav.getStarted": "Get started",
  "nav.mail": "Mail",
  "nav.review": "Review",
  "nav.notifications": "Notifications",
  "nav.dailySummary": "Daily summary",
  "nav.settings": "Settings",
  "common.language": "Language",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.enable": "Enable",
  "common.disable": "Disable",
  "common.loading": "Loading…",
  "common.active": "active",
  "common.paused": "paused",
  "settings.language.title": "Language",
  "settings.language.description": "Choose the language used by the Mailflow interface.",
  "settings.language.saved": "Language preference saved.",
  "onboarding.title": "Get started",
  "onboarding.step": "Step",
  "onboarding.of": "of",
  "onboarding.llm.title": "1. Connect an AI provider",
  "onboarding.account.title": "2. Connect a mailbox",
  "onboarding.done.title": "Ready",
  "onboarding.done.body": "Your mailbox is connected. Opening Mailflow…",
  "onboarding.mailboxPrivacy": "Mailbox privacy",
  "onboarding.whoAccess": "Who should have access?",
  "onboarding.privateOnlyMe": "Private — only me",
  "onboarding.sharedSelected": "Shared — selected members",
  "onboarding.membersAccess": "Members with mailbox access",
  "onboarding.sharedNotice": "Organization admins do not automatically get mailbox access. Only the selected members can see this mailbox.",
  "onboarding.browserLanguage": "We selected this language from your browser. You can change it now.",
  "mail.learnedDecisions": "Learned decisions",
  "decision.title": "Learned decisions",
  "decision.description": "Human-confirmed classification decisions that Mailflow can safely reuse.",
  "decision.entries": "entries",
  "decision.emptyTitle": "No learned decisions yet",
  "decision.emptyBody": "Confirmed and corrected classifications will appear here.",
  "decision.classification": "Classification",
  "decision.priority": "Priority",
  "decision.action": "Action",
  "decision.route": "Route",
  "decision.notFixed": "not fixed",
  "decision.updated": "Learned decision updated.",
  "decision.deleted": "Learned decision deleted.",
  "decision.deleteConfirm": "Delete this learned decision?",
  "category.work": "Work",
  "category.private": "Private",
  "category.finance": "Finance",
  "category.orders": "Orders",
  "category.appointments": "Appointments",
  "category.newsletters": "Newsletters",
  "category.notifications": "Notifications",
  "category.other": "Other",
  "importance.critical": "Critical",
  "importance.high": "High",
  "importance.normal": "Normal",
  "importance.low": "Low",
  "importance.unknown": "Unknown",
  "urgency.immediate": "Immediate",
  "urgency.today": "Today",
  "urgency.this_week": "This week",
  "urgency.none": "None",
  "urgency.unknown": "Unknown",
  "action_required.yes": "Required",
  "action_required.no": "No",
  "action_required.unknown": "Unknown",
} as const;

export type TranslationKey = keyof typeof en;

const de: Partial<Record<TranslationKey, string>> = {
  "nav.billing": "Abrechnung",
  "nav.getStarted": "Einrichtung",
  "nav.review": "Prüfung",
  "nav.notifications": "Benachrichtigungen",
  "nav.dailySummary": "Tagesübersicht",
  "nav.settings": "Einstellungen",
  "common.language": "Sprache",
  "common.save": "Speichern",
  "common.cancel": "Abbrechen",
  "common.delete": "Löschen",
  "common.edit": "Bearbeiten",
  "common.enable": "Aktivieren",
  "common.disable": "Deaktivieren",
  "common.loading": "Lädt…",
  "common.active": "aktiv",
  "common.paused": "pausiert",
  "settings.language.title": "Sprache",
  "settings.language.description": "Wähle die Sprache der Mailflow-Oberfläche.",
  "settings.language.saved": "Spracheinstellung gespeichert.",
  "onboarding.title": "Einrichtung",
  "onboarding.step": "Schritt",
  "onboarding.of": "von",
  "onboarding.llm.title": "1. KI-Anbieter verbinden",
  "onboarding.account.title": "2. Postfach verbinden",
  "onboarding.done.title": "Bereit",
  "onboarding.done.body": "Dein Postfach ist verbunden. Mailflow wird geöffnet…",
  "onboarding.mailboxPrivacy": "Postfach-Datenschutz",
  "onboarding.whoAccess": "Wer soll Zugriff haben?",
  "onboarding.privateOnlyMe": "Privat — nur ich",
  "onboarding.sharedSelected": "Geteilt — ausgewählte Mitglieder",
  "onboarding.membersAccess": "Mitglieder mit Postfachzugriff",
  "onboarding.sharedNotice": "Organisations-Admins erhalten nicht automatisch Zugriff. Nur die ausgewählten Mitglieder können dieses Postfach sehen.",
  "onboarding.browserLanguage": "Diese Sprache wurde anhand deines Browsers gewählt. Du kannst sie jetzt ändern.",
  "mail.learnedDecisions": "Gelernte Entscheidungen",
  "decision.title": "Gelernte Entscheidungen",
  "decision.description": "Von Menschen bestätigte Klassifizierungsentscheidungen, die Mailflow sicher wiederverwenden kann.",
  "decision.entries": "Einträge",
  "decision.emptyTitle": "Noch keine gelernten Entscheidungen",
  "decision.emptyBody": "Bestätigte und korrigierte Klassifizierungen erscheinen hier.",
  "decision.classification": "Klassifizierung",
  "decision.priority": "Priorität",
  "decision.action": "Aktion",
  "decision.route": "Ziel",
  "decision.notFixed": "nicht festgelegt",
  "decision.updated": "Gelernte Entscheidung aktualisiert.",
  "decision.deleted": "Gelernte Entscheidung gelöscht.",
  "decision.deleteConfirm": "Diese gelernte Entscheidung löschen?",
  "category.work": "Arbeit",
  "category.private": "Privat",
  "category.finance": "Finanzen",
  "category.orders": "Bestellungen",
  "category.appointments": "Termine",
  "category.newsletters": "Newsletter",
  "category.notifications": "Benachrichtigungen",
  "category.other": "Sonstiges",
  "importance.critical": "Kritisch",
  "importance.high": "Hoch",
  "importance.normal": "Normal",
  "importance.low": "Niedrig",
  "importance.unknown": "Unbekannt",
  "urgency.immediate": "Sofort",
  "urgency.today": "Heute",
  "urgency.this_week": "Diese Woche",
  "urgency.none": "Keine",
  "urgency.unknown": "Unbekannt",
  "action_required.yes": "Erforderlich",
  "action_required.no": "Nein",
  "action_required.unknown": "Unbekannt",
};

const es: Partial<Record<TranslationKey, string>> = {
  "nav.billing": "Facturación",
  "nav.getStarted": "Configuración",
  "nav.review": "Revisión",
  "nav.notifications": "Notificaciones",
  "nav.dailySummary": "Resumen diario",
  "nav.settings": "Ajustes",
  "common.language": "Idioma",
  "common.save": "Guardar",
  "common.cancel": "Cancelar",
  "common.delete": "Eliminar",
  "common.edit": "Editar",
  "common.enable": "Activar",
  "common.disable": "Desactivar",
  "common.loading": "Cargando…",
  "common.active": "activo",
  "common.paused": "pausado",
  "settings.language.title": "Idioma",
  "settings.language.description": "Elige el idioma de la interfaz de Mailflow.",
  "settings.language.saved": "Preferencia de idioma guardada.",
  "onboarding.title": "Configuración",
  "onboarding.step": "Paso",
  "onboarding.of": "de",
  "onboarding.llm.title": "1. Conectar un proveedor de IA",
  "onboarding.account.title": "2. Conectar un buzón",
  "onboarding.done.title": "Listo",
  "onboarding.done.body": "Tu buzón está conectado. Abriendo Mailflow…",
  "onboarding.mailboxPrivacy": "Privacidad del buzón",
  "onboarding.whoAccess": "¿Quién debe tener acceso?",
  "onboarding.privateOnlyMe": "Privado — solo yo",
  "onboarding.sharedSelected": "Compartido — miembros seleccionados",
  "onboarding.membersAccess": "Miembros con acceso al buzón",
  "onboarding.sharedNotice": "Los administradores de la organización no obtienen acceso automáticamente. Solo los miembros seleccionados pueden ver este buzón.",
  "onboarding.browserLanguage": "Hemos seleccionado este idioma según tu navegador. Puedes cambiarlo ahora.",
  "mail.learnedDecisions": "Decisiones aprendidas",
  "decision.title": "Decisiones aprendidas",
  "decision.description": "Decisiones de clasificación confirmadas por una persona que Mailflow puede reutilizar de forma segura.",
  "decision.entries": "entradas",
  "decision.emptyTitle": "Aún no hay decisiones aprendidas",
  "decision.emptyBody": "Las clasificaciones confirmadas y corregidas aparecerán aquí.",
  "decision.classification": "Clasificación",
  "decision.priority": "Prioridad",
  "decision.action": "Acción",
  "decision.route": "Destino",
  "decision.notFixed": "sin fijar",
  "decision.updated": "Decisión aprendida actualizada.",
  "decision.deleted": "Decisión aprendida eliminada.",
  "decision.deleteConfirm": "¿Eliminar esta decisión aprendida?",
  "category.work": "Trabajo",
  "category.private": "Privado",
  "category.finance": "Finanzas",
  "category.orders": "Pedidos",
  "category.appointments": "Citas",
  "category.newsletters": "Boletines",
  "category.notifications": "Notificaciones",
  "category.other": "Otros",
  "importance.critical": "Crítica",
  "importance.high": "Alta",
  "importance.normal": "Normal",
  "importance.low": "Baja",
  "importance.unknown": "Desconocida",
  "urgency.immediate": "Inmediata",
  "urgency.today": "Hoy",
  "urgency.this_week": "Esta semana",
  "urgency.none": "Ninguna",
  "urgency.unknown": "Desconocida",
  "action_required.yes": "Requerida",
  "action_required.no": "No",
  "action_required.unknown": "Desconocida",
};

const catalogs: Record<Locale, Partial<Record<TranslationKey, string>>> = {
  de,
  en,
  es,
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

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const browserLocale = detectBrowserLocale();
    const cached = window.localStorage.getItem(LOCAL_KEY) as Locale | null;
    const initial = cached && LOCALES.includes(cached) ? cached : browserLocale;
    setLocaleState(initial);
    document.documentElement.lang = initial;

    api
      .getUserPreferences()
      .then(async (preferences) => {
        if (!active) return;
        if (preferences.locale_configured) {
          setLocaleState(preferences.locale);
          window.localStorage.setItem(LOCAL_KEY, preferences.locale);
          document.documentElement.lang = preferences.locale;
        } else {
          await api.updateUserPreferences({ locale: initial });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(LOCAL_KEY, next);
    document.documentElement.lang = next;
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
      t: (key) => catalogs[locale][key] ?? en[key],
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
