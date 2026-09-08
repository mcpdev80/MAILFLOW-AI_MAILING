"use client";

import { type Locale, useI18n } from "@/lib/i18n";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "./settings-shell.module.css";

const itemDefs = [
  ["/app/settings/profile", "profile"],
  ["/app/settings/preferences", "appearance"],
  ["/app/settings/workspace", "workspace"],
  ["/app/settings/mailboxes", "mailboxes"],
  ["/app/settings/rules", "rules"],
  ["/app/settings/security", "security"],
  ["/app/settings/retention", "retention"],
] as const;

const mailboxToolDefs = [
  ["/app/settings/folders", "folders"],
  ["/app/settings/folder-discovery", "discovery"],
  ["/app/settings/category-mapping", "mapping"],
  ["/app/settings/structure-review", "review"],
] as const;

const copy = {
  de: {
    title: "Einstellungen",
    subtitle:
      "Persönliches Profil, Arbeitsbereich, Sicherheit und eigenes Postfachverhalten verwalten",
    nav: "Einstellungen",
    profile: "Profil & Konto",
    appearance: "Darstellung & Arbeitsbereich",
    workspace: "Mail-Layout anpassen",
    mailboxes: "Meine Postfächer",
    rules: "Regeln & Aktionen",
    security: "Sicherheit & Passkeys",
    retention: "Daten & Aufbewahrung",
    intelligence: "POSTFACH-INTELLIGENZ",
    folders: "Ordner & Tags",
    discovery: "Ordnererkennung",
    mapping: "Kategoriezuordnung",
    review: "Prüfen & Anwenden",
  },
  en: {
    title: "Settings",
    subtitle:
      "Manage your personal profile, workspace, security and mailbox behavior",
    nav: "Settings",
    profile: "Profile & Account",
    appearance: "Appearance & Workspace",
    workspace: "Customize mail layout",
    mailboxes: "My Mailboxes",
    rules: "Rules & Actions",
    security: "Security & Passkeys",
    retention: "Data & Retention",
    intelligence: "MAILBOX INTELLIGENCE",
    folders: "Folders & Tags",
    discovery: "Folder Discovery",
    mapping: "Category Mapping",
    review: "Review & Apply",
  },
  es: {
    title: "Ajustes",
    subtitle:
      "Gestiona tu perfil personal, espacio de trabajo, seguridad y comportamiento del buzón",
    nav: "Ajustes",
    profile: "Perfil y cuenta",
    appearance: "Apariencia y espacio de trabajo",
    workspace: "Personalizar diseño de correo",
    mailboxes: "Mis buzones",
    rules: "Reglas y acciones",
    security: "Seguridad y passkeys",
    retention: "Datos y retención",
    intelligence: "INTELIGENCIA DEL BUZÓN",
    folders: "Carpetas y etiquetas",
    discovery: "Detección de carpetas",
    mapping: "Asignación de categorías",
    review: "Revisar y aplicar",
  },
} satisfies Record<Locale, Record<string, string>>;

export function SettingsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { locale } = useI18n();
  const text = copy[locale];
  return (
    <main className={styles.page}>
      <div className={styles.titleBlock}>
        <h1>{text.title}</h1>
        <p>{text.subtitle}</p>
      </div>
      <div className={styles.split}>
        <nav className={styles.nav} aria-label={text.nav}>
          {itemDefs.map(([href, key]) => (
            <SettingsLink
              key={href}
              href={href}
              label={text[key]}
              pathname={pathname}
            />
          ))}
          <span className={styles.navGroupLabel}>{text.intelligence}</span>
          {mailboxToolDefs.map(([href, key]) => (
            <SettingsLink
              key={href}
              href={href}
              label={text[key]}
              pathname={pathname}
            />
          ))}
        </nav>
        {children}
      </div>
    </main>
  );
}

function SettingsLink({
  href,
  label,
  pathname,
}: { href: string; label: string; pathname: string }) {
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
    >
      {label}
    </Link>
  );
}

export { styles as settingsShellStyles };
