"use client";

import { api } from "@/lib/api";
import {
  type ReactNode,
  createContext,
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
  "settings.language.description":
    "Choose the language used by the Mailflow interface.",
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
  "onboarding.sharedNotice":
    "Organization admins do not automatically get mailbox access. Only the selected members can see this mailbox.",
  "onboarding.browserLanguage":
    "We selected this language from your browser. You can change it now.",
  "mail.learnedDecisions": "Learned decisions",
  "decision.title": "Learned decisions",
  "decision.description":
    "Human-confirmed classification decisions that Mailflow can safely reuse.",
  "decision.entries": "entries",
  "decision.emptyTitle": "No learned decisions yet",
  "decision.emptyBody":
    "Confirmed and corrected classifications will appear here.",
  "decision.classification": "Classification",
  "decision.priority": "Priority",
  "decision.action": "Action",
  "decision.route": "Route",
  "decision.notFixed": "not fixed",
  "decision.updated": "Learned decision updated.",
  "decision.deleted": "Learned decision deleted.",
  "decision.deleteConfirm": "Delete this learned decision?",
  "dashboard.compose": "Compose",
  "dashboard.drafts": "Drafts",
  "dashboard.security": "Security",
  "dashboard.connectMailbox": "+ Connect mailbox",
  "dashboard.noMailboxes": "No mailboxes connected yet.",
  "dashboard.connectFirst": "Connect your first mailbox",
  "dashboard.mailbox": "Mailbox",
  "dashboard.privacy": "Privacy",
  "dashboard.status": "Status",
  "dashboard.every": "Every",
  "dashboard.lastCycle": "Last cycle",
  "dashboard.never": "never",
  "dashboard.runNow": "Run now",
  "dashboard.running": "Running…",
  "dashboard.managedTitle": "Shared mailboxes you manage",
  "dashboard.managedBody":
    "These mailboxes are not visible to you unless you are also explicitly granted mailbox access.",
  "dashboard.manageOnly": "manage only",
  "dashboard.manageAccess": "Manage access",
  "review.title": "Review",
  "review.description":
    "Only exceptions and actionable items across your authorized mailboxes.",
  "review.urgent": "Urgent",
  "review.actionRequired": "Action required",
  "review.security": "Security",
  "review.failures": "Failures",
  "review.empty": "Nothing needs review.",
  "review.operational": "Operational exceptions",
  "review.messages": "Message review",
  "review.priority": "Priority",
  "review.correct": "Correct classification",
  "review.category": "Category",
  "review.subcategory": "Subcategory",
  "review.importance": "Importance",
  "review.urgency": "Urgency",
  "review.destination": "Destination",
  "review.remember": "Remember this correction in DecisionMemory",
  "review.saveCorrection": "Save correction",
  "review.retry": "Retry",
  "review.openManagement": "Open management",
  "review.approveRouting": "Approve routing",
  "review.rejectRouting": "Reject routing",
  "review.dismiss": "Dismiss",
  "review.openMessage": "Open message",
  "review.noSubject": "(No subject)",
  "review.confidence": "confidence",
  "notifications.description": "Exceptions and actionable events only.",
  "notifications.preferences": "Preferences",
  "notifications.urgentAction": "Urgent / action-required",
  "notifications.securityReview": "Security / review",
  "notifications.jobResult": "Job completion / failure",
  "notifications.mailboxHealth": "Mailbox health",
  "notifications.savePreferences": "Save preferences",
  "notifications.saving": "Saving…",
  "notifications.inbox": "Inbox",
  "notifications.unread": "unread",
  "notifications.empty": "No notifications.",
  "notifications.markRead": "Mark read",
  "summary.description":
    "Deterministic digest from persisted Mailflow state — no extra LLM pass.",
  "summary.urgent": "Urgent",
  "summary.action": "Action required",
  "summary.review": "Awaiting review",
  "summary.security": "Security",
  "summary.failures": "Failures / blocked actions",
  "summary.important": "Important new mail",
  "summary.since": "Since",
  "summary.generated": "generated",
  "summary.empty": "No actionable items in this period.",
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
  "onboarding.done.body":
    "Dein Postfach ist verbunden. Mailflow wird geöffnet…",
  "onboarding.mailboxPrivacy": "Postfach-Datenschutz",
  "onboarding.whoAccess": "Wer soll Zugriff haben?",
  "onboarding.privateOnlyMe": "Privat — nur ich",
  "onboarding.sharedSelected": "Geteilt — ausgewählte Mitglieder",
  "onboarding.membersAccess": "Mitglieder mit Postfachzugriff",
  "onboarding.sharedNotice":
    "Organisations-Admins erhalten nicht automatisch Zugriff. Nur die ausgewählten Mitglieder können dieses Postfach sehen.",
  "onboarding.browserLanguage":
    "Diese Sprache wurde anhand deines Browsers gewählt. Du kannst sie jetzt ändern.",
  "mail.learnedDecisions": "Gelernte Entscheidungen",
  "decision.title": "Gelernte Entscheidungen",
  "decision.description":
    "Von Menschen bestätigte Klassifizierungsentscheidungen, die Mailflow sicher wiederverwenden kann.",
  "decision.entries": "Einträge",
  "decision.emptyTitle": "Noch keine gelernten Entscheidungen",
  "decision.emptyBody":
    "Bestätigte und korrigierte Klassifizierungen erscheinen hier.",
  "decision.classification": "Klassifizierung",
  "decision.priority": "Priorität",
  "decision.action": "Aktion",
  "decision.route": "Ziel",
  "decision.notFixed": "nicht festgelegt",
  "decision.updated": "Gelernte Entscheidung aktualisiert.",
  "decision.deleted": "Gelernte Entscheidung gelöscht.",
  "decision.deleteConfirm": "Diese gelernte Entscheidung löschen?",
  "dashboard.compose": "Verfassen",
  "dashboard.drafts": "Entwürfe",
  "dashboard.security": "Sicherheit",
  "dashboard.connectMailbox": "+ Postfach verbinden",
  "dashboard.noMailboxes": "Noch keine Postfächer verbunden.",
  "dashboard.connectFirst": "Erstes Postfach verbinden",
  "dashboard.mailbox": "Postfach",
  "dashboard.privacy": "Datenschutz",
  "dashboard.status": "Status",
  "dashboard.every": "Intervall",
  "dashboard.lastCycle": "Letzter Lauf",
  "dashboard.never": "nie",
  "dashboard.runNow": "Jetzt ausführen",
  "dashboard.running": "Läuft…",
  "dashboard.managedTitle": "Geteilte Postfächer, die du verwaltest",
  "dashboard.managedBody":
    "Diese Postfächer sind für dich nur sichtbar, wenn dir zusätzlich ausdrücklich Postfachzugriff gewährt wurde.",
  "dashboard.manageOnly": "nur verwalten",
  "dashboard.manageAccess": "Zugriff verwalten",
  "review.title": "Prüfung",
  "review.description":
    "Nur Ausnahmen und handlungsrelevante Elemente aus deinen berechtigten Postfächern.",
  "review.urgent": "Dringend",
  "review.actionRequired": "Aktion erforderlich",
  "review.security": "Sicherheit",
  "review.failures": "Fehler",
  "review.empty": "Keine Prüfung erforderlich.",
  "review.operational": "Betriebliche Ausnahmen",
  "review.messages": "Nachrichtenprüfung",
  "review.priority": "Priorität",
  "review.correct": "Klassifizierung korrigieren",
  "review.category": "Kategorie",
  "review.subcategory": "Unterkategorie",
  "review.importance": "Wichtigkeit",
  "review.urgency": "Dringlichkeit",
  "review.destination": "Ziel",
  "review.remember": "Diese Korrektur in DecisionMemory merken",
  "review.saveCorrection": "Korrektur speichern",
  "review.retry": "Erneut versuchen",
  "review.openManagement": "Verwaltung öffnen",
  "review.approveRouting": "Routing genehmigen",
  "review.rejectRouting": "Routing ablehnen",
  "review.dismiss": "Ausblenden",
  "review.openMessage": "Nachricht öffnen",
  "review.noSubject": "(Kein Betreff)",
  "review.confidence": "Konfidenz",
  "notifications.description":
    "Nur Ausnahmen und handlungsrelevante Ereignisse.",
  "notifications.preferences": "Einstellungen",
  "notifications.urgentAction": "Dringend / Aktion erforderlich",
  "notifications.securityReview": "Sicherheit / Prüfung",
  "notifications.jobResult": "Job abgeschlossen / fehlgeschlagen",
  "notifications.mailboxHealth": "Postfachstatus",
  "notifications.savePreferences": "Einstellungen speichern",
  "notifications.saving": "Speichert…",
  "notifications.inbox": "Eingang",
  "notifications.unread": "ungelesen",
  "notifications.empty": "Keine Benachrichtigungen.",
  "notifications.markRead": "Als gelesen markieren",
  "summary.description":
    "Deterministische Übersicht aus gespeichertem Mailflow-Zustand — ohne zusätzlichen LLM-Aufruf.",
  "summary.urgent": "Dringend",
  "summary.action": "Aktion erforderlich",
  "summary.review": "Prüfung ausstehend",
  "summary.security": "Sicherheit",
  "summary.failures": "Fehler / blockierte Aktionen",
  "summary.important": "Wichtige neue Nachrichten",
  "summary.since": "Seit",
  "summary.generated": "erstellt",
  "summary.empty":
    "In diesem Zeitraum gibt es keine handlungsrelevanten Elemente.",
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
  "settings.language.description":
    "Elige el idioma de la interfaz de Mailflow.",
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
  "onboarding.sharedNotice":
    "Los administradores de la organización no obtienen acceso automáticamente. Solo los miembros seleccionados pueden ver este buzón.",
  "onboarding.browserLanguage":
    "Hemos seleccionado este idioma según tu navegador. Puedes cambiarlo ahora.",
  "mail.learnedDecisions": "Decisiones aprendidas",
  "decision.title": "Decisiones aprendidas",
  "decision.description":
    "Decisiones de clasificación confirmadas por una persona que Mailflow puede reutilizar de forma segura.",
  "decision.entries": "entradas",
  "decision.emptyTitle": "Aún no hay decisiones aprendidas",
  "decision.emptyBody":
    "Las clasificaciones confirmadas y corregidas aparecerán aquí.",
  "decision.classification": "Clasificación",
  "decision.priority": "Prioridad",
  "decision.action": "Acción",
  "decision.route": "Destino",
  "decision.notFixed": "sin fijar",
  "decision.updated": "Decisión aprendida actualizada.",
  "decision.deleted": "Decisión aprendida eliminada.",
  "decision.deleteConfirm": "¿Eliminar esta decisión aprendida?",
  "dashboard.compose": "Redactar",
  "dashboard.drafts": "Borradores",
  "dashboard.security": "Seguridad",
  "dashboard.connectMailbox": "+ Conectar buzón",
  "dashboard.noMailboxes": "Aún no hay buzones conectados.",
  "dashboard.connectFirst": "Conecta tu primer buzón",
  "dashboard.mailbox": "Buzón",
  "dashboard.privacy": "Privacidad",
  "dashboard.status": "Estado",
  "dashboard.every": "Cada",
  "dashboard.lastCycle": "Último ciclo",
  "dashboard.never": "nunca",
  "dashboard.runNow": "Ejecutar ahora",
  "dashboard.running": "Ejecutando…",
  "dashboard.managedTitle": "Buzones compartidos que administras",
  "dashboard.managedBody":
    "Estos buzones no son visibles salvo que también tengas acceso explícito al buzón.",
  "dashboard.manageOnly": "solo administrar",
  "dashboard.manageAccess": "Administrar acceso",
  "review.title": "Revisión",
  "review.description":
    "Solo excepciones y elementos que requieren acción en tus buzones autorizados.",
  "review.urgent": "Urgente",
  "review.actionRequired": "Acción requerida",
  "review.security": "Seguridad",
  "review.failures": "Fallos",
  "review.empty": "Nada necesita revisión.",
  "review.operational": "Excepciones operativas",
  "review.messages": "Revisión de mensajes",
  "review.priority": "Prioridad",
  "review.correct": "Corregir clasificación",
  "review.category": "Categoría",
  "review.subcategory": "Subcategoría",
  "review.importance": "Importancia",
  "review.urgency": "Urgencia",
  "review.destination": "Destino",
  "review.remember": "Recordar esta corrección en DecisionMemory",
  "review.saveCorrection": "Guardar corrección",
  "review.retry": "Reintentar",
  "review.openManagement": "Abrir administración",
  "review.approveRouting": "Aprobar enrutamiento",
  "review.rejectRouting": "Rechazar enrutamiento",
  "review.dismiss": "Descartar",
  "review.openMessage": "Abrir mensaje",
  "review.noSubject": "(Sin asunto)",
  "review.confidence": "confianza",
  "notifications.description":
    "Solo excepciones y eventos que requieren acción.",
  "notifications.preferences": "Preferencias",
  "notifications.urgentAction": "Urgente / acción requerida",
  "notifications.securityReview": "Seguridad / revisión",
  "notifications.jobResult": "Finalización / fallo de trabajo",
  "notifications.mailboxHealth": "Estado del buzón",
  "notifications.savePreferences": "Guardar preferencias",
  "notifications.saving": "Guardando…",
  "notifications.inbox": "Bandeja",
  "notifications.unread": "sin leer",
  "notifications.empty": "Sin notificaciones.",
  "notifications.markRead": "Marcar como leído",
  "summary.description":
    "Resumen determinista del estado persistido de Mailflow — sin llamada LLM adicional.",
  "summary.urgent": "Urgente",
  "summary.action": "Acción requerida",
  "summary.review": "Pendiente de revisión",
  "summary.security": "Seguridad",
  "summary.failures": "Fallos / acciones bloqueadas",
  "summary.important": "Correo nuevo importante",
  "summary.since": "Desde",
  "summary.generated": "generado",
  "summary.empty": "No hay elementos accionables en este periodo.",
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
