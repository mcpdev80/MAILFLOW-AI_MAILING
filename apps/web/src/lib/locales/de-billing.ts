import type { TranslationKey } from "./types";

export const deBilling: Partial<Record<TranslationKey, string>> = {
  "billing.back": "Dashboard",
  "billing.title": "Abrechnung",
  "billing.currentPlan": "Aktueller Plan",
  "billing.seats": "Plätze",
  "billing.selfHost": "Self-Host",
  "billing.mailboxes": "Postfächer",
  "billing.emailsToday": "E-Mails heute",
  "billing.unlimited": "Unbegrenzt",
  "billing.manage": "Abonnement verwalten",
  "billing.upgradePro": "Auf Pro upgraden",
  "billing.teamSeats": "Team-Plätze",
  "billing.minimum": "min.",
  "billing.upgradeTeam": "Auf Team upgraden ({count} Plätze)",
  "billing.manageCancel": "Abonnement verwalten / kündigen",
  "billing.selfHostedInfo": "Dies ist eine selbst gehostete Instanz — es gelten keine Planlimits. Abrechnung wird nur für das verwaltete SaaS verwendet.",
  "billing.loadFailed": "Abrechnung konnte nicht geladen werden",
  "billing.notConfigured": "Abrechnung ist auf diesem Server nicht konfiguriert.",
  "billing.checkoutFailed": "Checkout fehlgeschlagen",
  "billing.portalFailed": "Abrechnungsportal konnte nicht geöffnet werden",
};
