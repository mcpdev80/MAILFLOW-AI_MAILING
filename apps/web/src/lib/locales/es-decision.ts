import type { TranslationKey } from "./types";

export const esDecision: Partial<Record<TranslationKey, string>> = {
  "decision.enabled": "Activo",
  "decision.disabled": "Desactivado",
  "decision.superseded": "Reemplazado",
  "decision.trust": "Confianza",
  "decision.used": "Usado",
  "decision.lastUsed": "Último uso",
  "decision.source": "Origen",
  "decision.subcategory": "Subcategoría",
  "decision.importance": "Importancia",
  "decision.urgency": "Urgencia",
  "decision.actionRequired": "Acción requerida",
  "decision.subjectPattern": "Patrón del asunto",
  "decision.routingTarget": "Destino de enrutamiento",
  "decision.saveCorrection": "Guardar corrección",
  "decision.loadFailed": "No se pudieron cargar las decisiones aprendidas.",
  "decision.updateFailed": "No se pudo actualizar la decisión aprendida.",
};
