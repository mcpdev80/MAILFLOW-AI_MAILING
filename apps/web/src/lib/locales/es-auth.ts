import type { TranslationKey } from "./types";

export const esAuth: Partial<Record<TranslationKey, string>> = {
  "auth.login.title": "Iniciar sesión",
  "auth.login.passkey": "Iniciar sesión con passkey",
  "auth.login.passkeyHint":
    "Usa Windows Hello, Touch ID, tu teléfono o una llave de seguridad.",
  "auth.login.passwordHint":
    "El acceso por email y contraseña sigue disponible para migración y recuperación de la cuenta.",
  "auth.login.email": "Email",
  "auth.login.password": "Contraseña",
  "auth.login.passwordAction": "Entrar con contraseña",
  "auth.login.signingIn": "Entrando…",
  "auth.login.noAccount": "¿No tienes cuenta?",
  "auth.login.create": "Crear cuenta",
  "auth.login.failed": "No se pudo iniciar sesión",
  "auth.login.passkeyFailed": "No se pudo iniciar sesión con la passkey",
  "auth.signup.title": "Crear cuenta",
  "auth.signup.name": "Tu nombre",
  "auth.signup.organization": "Nombre de la organización",
  "auth.signup.email": "Email",
  "auth.signup.password": "Contraseña",
  "auth.signup.action": "Crear cuenta",
  "auth.signup.creating": "Creando…",
  "auth.signup.hasAccount": "¿Ya tienes cuenta?",
  "auth.signup.login": "Iniciar sesión",
  "auth.signup.accountFailed": "No se pudo crear la cuenta",
  "auth.signup.organizationFailed": "No se pudo crear la organización",
};
