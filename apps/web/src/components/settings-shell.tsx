"use client";

import { useI18n, type Locale } from "@/lib/i18n";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "./settings-shell.module.css";

const itemDefs = [
  ["/app/settings/profile", "profile"],
  ["/app/settings/preferences", "appearance"],
  ["/app/settings/mailboxes", "mailboxes"],
  ["/app/settings/models", "providers"],
  ["/app/settings/rules", "rules"],
  ["/app/settings/members", "organization"],
  ["/app/settings/security", "security"],
  ["/app/settings/retention", "retention"],
  ["/app/billing", "billing"],
] as const;

const mailboxToolDefs = [
  ["/app/settings/folders", "folders"],
  ["/app/settings/folder-discovery", "discovery"],
  ["/app/settings/category-mapping", "mapping"],
  ["/app/settings/review-apply", "review"],
] as const;

const copy = {
  de: {
    title: "Einstellungen",
    subtitle: "Profil, Arbeitsbereich, Sicherheit, Integrationen und Postfachverhalten verwalten",
    nav: "Einstellungen",
    profile: "Profil & Konto",
    appearance: "Darstellung & Arbeitsbereich",
    mailboxes: "Postfächer",
    providers: "KI-Anbieter",
    rules: "Regeln & Aktionen",
    organization: "Organisation",
    security: "Sicherheit & Passkeys",
    retention: "Daten & Aufbewahrung",
    billing: "Abrechnung",
    intelligence: "POSTFACH-INTELLIGENZ",
    folders: "Ordner & Tags",
    discovery: "Ordnererkennung",
    mapping: "Kategoriezuordnung",
    review: "Prüfen & Anwenden",
  },
  en: {
    title: "Settings",
    subtitle: "Manage your profile, workspace, security, integrations and mailbox behavior",
    nav: "Settings",
    profile: "Profile & Account",
    appearance: "Appearance & Workspace",
    mailboxes: "Mailboxes",
    providers: "AI Providers",
    rules: "Rules & Actions",
    organization: "Organization",
    security: "Security & Passkeys",
    retention: "Data & Retention",
    billing: "Billing",
    intelligence: "MAILBOX INTELLIGENCE",
    folders: "Folders & Tags",
    discovery: "Folder Discovery",
    mapping: "Category Mapping",
    review: "Review & Apply",
  },
  es: {
    title: "Ajustes",
    subtitle: "Gestiona tu perfil, espacio de trabajo, seguridad, integraciones y comportamiento del buzón",
    nav: "Ajustes",
    profile: "Perfil y cuenta",
    appearance: "Apariencia y espacio de trabajo",
    mailboxes: "Buzones",
    providers: "Proveedores de IA",
    rules: "Reglas y acciones",
    organization: "Organización",
    security: "Seguridad y passkeys",
    retention: "Datos y retención",
    billing: "Facturación",
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
            <SettingsLink key={href} href={href} label={text[key]} pathname={pathname} />
          ))}
          <span className={styles.navGroupLabel}>{text.intelligence}</span>
          {mailboxToolDefs.map(([href, key]) => (
            <SettingsLink key={href} href={href} label={text[key]} pathname={pathname} />
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
