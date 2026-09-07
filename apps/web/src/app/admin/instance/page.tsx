"use client";

import { useAccessContext } from "@/lib/access-context";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import styles from "../admin-pages.module.css";

const COPY = {
  de: {
    title: "Instanzverwaltung",
    description:
      "Verwalte MailFlow als Plattform. Dieser Bereich enthält bewusst keine Postfächer oder E-Mail-Inhalte.",
    role: "Instanzrolle",
    orgs: "Eigene Organisationsrollen",
    data: "Datenschutzgrenze",
    dataText:
      "Die Instanzrolle gewährt keinen automatischen Zugriff auf E-Mails, Anhänge oder Entwürfe.",
    manage: "Organisationen verwalten",
  },
  en: {
    title: "Instance administration",
    description:
      "Manage MailFlow as a platform. This area intentionally contains no mailboxes or email content.",
    role: "Instance role",
    orgs: "Own organization roles",
    data: "Data boundary",
    dataText:
      "The instance role does not automatically grant access to emails, attachments or drafts.",
    manage: "Manage organizations",
  },
  es: {
    title: "Administración de instancia",
    description:
      "Administra MailFlow como plataforma. Esta área no contiene buzones ni contenido de correo.",
    role: "Rol de instancia",
    orgs: "Roles propios de organización",
    data: "Límite de datos",
    dataText:
      "El rol de instancia no concede acceso automático a correos, adjuntos ni borradores.",
    manage: "Gestionar organizaciones",
  },
} as const;

export default function InstanceAdminPage() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const { context } = useAccessContext();

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </header>
      <section className={styles.grid}>
        <article className={styles.card}>
          <h2>{copy.role}</h2>
          <div className={styles.metric}>{context?.instance_role ?? "–"}</div>
        </article>
        <article className={styles.card}>
          <h2>{copy.orgs}</h2>
          <div className={styles.metric}>{context?.organizations.length ?? 0}</div>
        </article>
        <article className={styles.card}>
          <h2>{copy.data}</h2>
          <p>{copy.dataText}</p>
        </article>
      </section>
      <div>
        <Link className="btn" href="/admin/instance/organizations">
          {copy.manage}
        </Link>
      </div>
    </div>
  );
}
