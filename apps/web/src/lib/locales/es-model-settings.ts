import type { TranslationKey } from "./types";

export const esModelSettings: Partial<Record<TranslationKey, string>> = {
  "models.back": "Panel",
  "models.title": "Roles de modelo",
  "models.description":
    "La clasificación rápida gestiona las primeras etapas, la clasificación profunda los casos ambiguos y el modelo de generación las tareas de escritura. Los endpoints por rol son opcionales y usan los valores predeterminados del proveedor como fallback.",
  "models.loading": "Cargando ajustes de modelos…",
  "models.empty": "Todavía no hay ningún proveedor LLM configurado.",
  "models.configure": "Configurar proveedor",
  "models.provider": "Perfil del proveedor",
  "models.fast": "Clasificación rápida",
  "models.deep": "Clasificación profunda",
  "models.generation": "Generación",
  "models.model": "Modelo",
  "models.endpoint": "Sobrescribir endpoint",
  "models.apiKey": "Sobrescribir clave API",
  "models.configured": "Configurado",
  "models.sharedKey": "Usar clave compartida",
  "models.save": "Guardar roles de modelo",
  "models.saving": "Guardando…",
  "models.saved": "Se actualizaron los roles de modelo.",
  "models.loadFailed": "No se pudieron cargar los proveedores LLM.",
  "models.saveFailed": "No se pudieron guardar los roles de modelo.",
};
