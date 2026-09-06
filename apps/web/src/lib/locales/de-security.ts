import type { TranslationKey } from "./types";

export const deSecurity: Partial<Record<TranslationKey, string>> = {
  "security.title": "Sicherheit",
  "security.description":
    "Passkeys authentifizieren deinen bestehenden Mailflow-Benutzer. Sie ändern keine Postfachberechtigungen und ersetzen keine IMAP-, OAuth- oder API-Zugangsdaten.",
  "security.addTitle": "Passkey registrieren",
  "security.deviceName": "Gerätename",
  "security.devicePlaceholder":
    "z. B. Laptop, Telefon oder USB-Sicherheitsschlüssel",
  "security.add": "Passkey hinzufügen",
  "security.registered": "Registrierte Passkeys",
  "security.empty": "Noch keine Passkeys registriert.",
  "security.unnamed": "Passkey ohne Namen",
  "security.created": "Erstellt",
  "security.type": "Typ",
  "security.backedUp": "Synchronisiert / gesichert",
  "security.rename": "Umbenennen",
  "security.delete": "Löschen",
  "security.renamePrompt": "Name des Passkeys",
  "security.deleteConfirm": 'Passkey "{name}" löschen?',
  "security.recentAuth":
    "Authentifiziere dich erneut, bevor du Zugriffsmethoden löschst.",
  "security.signInAgain": "Erneut anmelden",
  "security.recoveryTitle": "Wiederherstellung",
  "security.recovery":
    "Verwende nach Möglichkeit mehr als einen Passkey. Die Anmeldung mit E-Mail und Passwort bleibt während der Migration als Wiederherstellungsweg verfügbar. Mailflow entfernt dein Passwort nicht automatisch, wenn du einen Passkey hinzufügst.",
  "security.loadFailed": "Passkeys konnten nicht geladen werden.",
  "security.addFailed": "Passkey konnte nicht registriert werden.",
  "security.renameFailed": "Passkey konnte nicht umbenannt werden.",
  "security.deleteFailed": "Passkey konnte nicht gelöscht werden.",
};
