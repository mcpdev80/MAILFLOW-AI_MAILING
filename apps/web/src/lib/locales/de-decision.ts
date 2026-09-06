import type { TranslationKey } from "./types";

export const deDecision: Partial<Record<TranslationKey, string>> = {
  "decision.enabled": "Aktiv",
  "decision.disabled": "Deaktiviert",
  "decision.superseded": "Ersetzt",
  "decision.trust": "Vertrauen",
  "decision.used": "Verwendet",
  "decision.lastUsed": "Zuletzt verwendet",
  "decision.source": "Quelle",
  "decision.subcategory": "Unterkategorie",
  "decision.importance": "Wichtigkeit",
  "decision.urgency": "Dringlichkeit",
  "decision.actionRequired": "Aktion erforderlich",
  "decision.subjectPattern": "Betreffmuster",
  "decision.routingTarget": "Routing-Ziel",
  "decision.saveCorrection": "Korrektur speichern",
  "decision.loadFailed":
    "Gelernte Entscheidungen konnten nicht geladen werden.",
  "decision.updateFailed":
    "Gelernte Entscheidung konnte nicht aktualisiert werden.",
};
