import type { TranslationKey } from "./types";

export const deMembers: Partial<Record<TranslationKey, string>> = {
  "members.back": "Dashboard",
  "members.title": "Teammitglieder",
  "members.members": "Mitglieder",
  "members.empty": "Noch keine Mitglieder.",
  "members.inviteTitle": "Per E-Mail einladen",
  "members.emailPlaceholder": "person@firma.de",
  "members.role.member": "Mitglied",
  "members.role.admin": "Administrator",
  "members.invite": "Einladen",
  "members.inviting": "Wird eingeladen…",
  "members.pending": "Ausstehende Einladungen",
  "members.loadFailed": "Organisationsmitglieder konnten nicht geladen werden.",
  "members.inviteFailed": "Einladung konnte nicht gesendet werden.",
};
