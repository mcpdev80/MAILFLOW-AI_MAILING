import type { Locale } from "@/lib/i18n";

type FolderLike = {
  name: string;
  role?: string | null;
};

const LABELS: Record<Locale, Record<string, string>> = {
  de: {
    inbox: "Posteingang",
    archive: "Archiv",
    drafts: "Entwürfe",
    sent: "Gesendet",
    trash: "Papierkorb",
    spam: "Spam",
    all: "Alle Nachrichten",
  },
  en: {
    inbox: "Inbox",
    archive: "Archive",
    drafts: "Drafts",
    sent: "Sent",
    trash: "Trash",
    spam: "Spam",
    all: "All Mail",
  },
  es: {
    inbox: "Bandeja de entrada",
    archive: "Archivo",
    drafts: "Borradores",
    sent: "Enviados",
    trash: "Papelera",
    spam: "Spam",
    all: "Todos los mensajes",
  },
};

export function mailFolderLabel(folder: FolderLike, locale: Locale): string {
  const role = folder.role?.toLowerCase();
  if (role && LABELS[locale][role]) return LABELS[locale][role];
  if (folder.name.toUpperCase() === "INBOX") return LABELS[locale].inbox;
  return folder.name;
}
