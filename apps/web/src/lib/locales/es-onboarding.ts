import type { TranslationKey } from "./types";

export const esOnboarding: Partial<Record<TranslationKey, string>> = {
  "onboarding.bootstrap.title": "Instalación detectada",
  "onboarding.bootstrap.description":
    "Estos ajustes ya fueron definidos por la instalación y no es necesario introducirlos de nuevo.",
  "onboarding.bootstrap.publicUrl": "URL pública",
  "onboarding.bootstrap.tls": "TLS",
  "onboarding.bootstrap.language": "Idioma",
  "onboarding.bootstrap.source": "Origen",
  "onboarding.bootstrap.configured": "Ya configurado",
  "onboarding.providerLabel": "Etiqueta",
  "onboarding.providerType": "Tipo",
  "onboarding.baseUrl": "URL base",
  "onboarding.classificationModel": "Modelo de clasificación",
  "onboarding.generationModel": "Modelo de generación",
  "onboarding.apiKey": "Clave API",
  "onboarding.apiKeyHint":
    "Déjalo vacío si el proveedor local no requiere una clave.",
  "onboarding.provider.ollama": "Ollama (local)",
  "onboarding.provider.openai": "OpenAI",
  "onboarding.provider.anthropic": "Anthropic",
  "onboarding.provider.custom": "Personalizado (compatible con OpenAI)",
  "onboarding.continue": "Continuar",
  "onboarding.saving": "Guardando…",
  "onboarding.accountDescription":
    "Usa OAuth cuando esté disponible o introduce los datos IMAP abajo.",
  "onboarding.gmail": "Conectar Gmail",
  "onboarding.microsoft": "Conectar Microsoft 365",
  "onboarding.oauthServerHint":
    "OAuth requiere las credenciales de cliente correspondientes en el servidor. Si OAuth no está configurado, usa IMAP abajo.",
  "onboarding.imapTitle": "O conectar mediante IMAP",
  "onboarding.imapHost": "Host IMAP",
  "onboarding.username": "Usuario",
  "onboarding.password": "Contraseña / contraseña de aplicación",
  "onboarding.interval": "Comprobar cada (minutos)",
  "onboarding.llmProvider": "Proveedor LLM",
  "onboarding.finish": "Finalizar",
  "onboarding.connecting": "Conectando…",
  "onboarding.providerFailed": "No se pudo guardar el proveedor.",
  "onboarding.accountFailed": "No se pudo conectar el buzón.",
  "onboarding.oauthFailed": "No se pudo iniciar la autenticación OAuth.",
};
