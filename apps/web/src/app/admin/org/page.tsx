"use client";

import { useAccessContext } from "@/lib/access-context";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import styles from "../admin-pages.module.css";

const COPY = {
  de: {
    title: "Organisationsverwaltung",
    description:
      "Verwalte Mitglieder und organisatorische Einstellungen getrennt von der persönlichen Mail-Oberfläche.",
    organization: "Aktive Organisation",
    role: "Organisationsrolle",
    privacy: "Mail-Zugriff",
    privacyText:
      "Eine Admin-Rolle allein erlaubt nicht das Lesen fremder Postfächer. Datenzugriff bleibt an Postfach-Berechtigungen gebunden.",
    members: "Mitglieder verwalten",
  },
  en: {
    title: "Organization administration",
    description:
      "Manage members and organization settings separately from the personal mail interface.",
    organization: "Active organization",
    role: "Organization role",
    privacy: "Mail access",
    privacyText:
      "An admin role alone does not permit reading other users' mailboxes. Data access remains bound to mailbox permissions.",
    members: "Manage members",
  },
  es: {
    title: "Administración de organización",
    description:
      "Administra miembros y ajustes de la organización separados de la interfaz personal de correo.",
    organization: "Organización activa",
    role: "Rol de organización",
    privacy: "Acceso al correo",
    privacyText:
      "El rol de administrador por sí solo no permite leer buzones ajenos. El acceso sigue ligado a permisos del buzón.",
    members: "Gestionar miembros",
  },
} as const;

export default function OrganizationAdminPage() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const { context } = useAccessContext();
  const active = context?.organizations.find(
    (org) => org.id === context.active_organization_id,
  );

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </header>
      <section className={styles.grid}>
        <article className={styles.card}>
          <h2>{copy.organization}</h2>
          <div className={styles.metric}>{active?.name ?? "–"}</div>
        </article>
        <article className={styles.card}>
          <h2>{copy.role}</h2>
          <div className={styles.metric}>{active?.role ?? "–"}</div>
        </article>
        <article className={styles.card}>
          <h2>{copy.privacy}</h2>
          <p>{copy.privacyText}</p>
        </article>
      </section>
      <div>
        <Link className="btn" href="/admin/org/members">
          {copy.members}
        </Link>
      </div>
    </div>
  );
}
