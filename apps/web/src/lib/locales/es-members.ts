import type { TranslationKey } from "./types";

export const esMembers: Partial<Record<TranslationKey, string>> = {
  "members.back": "Panel",
  "members.title": "Miembros del equipo",
  "members.members": "Miembros",
  "members.empty": "Todavía no hay miembros.",
  "members.inviteTitle": "Invitar por email",
  "members.emailPlaceholder": "persona@empresa.com",
  "members.role.member": "Miembro",
  "members.role.admin": "Administrador",
  "members.invite": "Invitar",
  "members.inviting": "Invitando…",
  "members.pending": "Invitaciones pendientes",
  "members.loadFailed":
    "No se pudieron cargar los miembros de la organización.",
  "members.inviteFailed": "No se pudo enviar la invitación.",
  "invitation.title": "Invitación a la organización",
  "invitation.loading": "Cargando invitación…",
  "invitation.organization": "Organización",
  "invitation.email": "Email invitado",
  "invitation.role": "Rol",
  "invitation.accept": "Aceptar invitación",
  "invitation.accepting": "Aceptando…",
  "invitation.decline": "Rechazar",
  "invitation.declining": "Rechazando…",
  "invitation.accepted": "Invitación aceptada.",
  "invitation.declined": "Invitación rechazada.",
  "invitation.invalid":
    "Esta invitación no es válida, ha caducado o ya no está disponible.",
  "invitation.failed": "No se pudo procesar la invitación.",
};
