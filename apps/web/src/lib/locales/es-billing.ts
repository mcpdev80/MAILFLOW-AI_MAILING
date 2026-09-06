import type { TranslationKey } from "./types";

export const esBilling: Partial<Record<TranslationKey, string>> = {
  "billing.back": "Panel",
  "billing.title": "Facturación",
  "billing.currentPlan": "Plan actual",
  "billing.seats": "plazas",
  "billing.selfHost": "autoalojado",
  "billing.mailboxes": "buzones",
  "billing.emailsToday": "correos hoy",
  "billing.unlimited": "Ilimitado",
  "billing.manage": "Gestionar suscripción",
  "billing.upgradePro": "Mejorar a Pro",
  "billing.teamSeats": "Plazas del equipo",
  "billing.minimum": "mín.",
  "billing.upgradeTeam": "Mejorar a Team ({count} plazas)",
  "billing.manageCancel": "Gestionar / cancelar suscripción",
  "billing.selfHostedInfo":
    "Esta es una instancia autoalojada: no se aplican límites de plan. La facturación solo se usa en el SaaS gestionado.",
  "billing.loadFailed": "No se pudo cargar la facturación",
  "billing.notConfigured":
    "La facturación no está configurada en este servidor.",
  "billing.checkoutFailed": "El checkout falló",
  "billing.portalFailed": "No se pudo abrir el portal de facturación",
};
