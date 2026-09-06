import type { TranslationKey } from "./types";

export const deModelSettings: Partial<Record<TranslationKey, string>> = {
  "models.back": "Dashboard",
  "models.title": "Modellrollen",
  "models.description": "Die schnelle Klassifizierung verarbeitet die frühen Stufen, die tiefe Klassifizierung mehrdeutige Fälle und das Generierungsmodell Schreibaufgaben. Rollenspezifische Endpunkte sind optional und fallen auf die Provider-Standardwerte zurück.",
  "models.loading": "Modelleinstellungen werden geladen…",
  "models.empty": "Noch kein LLM-Provider konfiguriert.",
  "models.configure": "Provider konfigurieren",
  "models.provider": "Provider-Profil",
  "models.fast": "Schnelle Klassifizierung",
  "models.deep": "Tiefe Klassifizierung",
  "models.generation": "Generierung",
  "models.model": "Modell",
  "models.endpoint": "Endpunkt überschreiben",
  "models.apiKey": "API-Key überschreiben",
  "models.configured": "Konfiguriert",
  "models.sharedKey": "Gemeinsamen Key verwenden",
  "models.save": "Modellrollen speichern",
  "models.saving": "Wird gespeichert…",
  "models.saved": "Modellrollen wurden aktualisiert.",
  "models.loadFailed": "LLM-Provider konnten nicht geladen werden.",
  "models.saveFailed": "Modellrollen konnten nicht gespeichert werden.",
};
