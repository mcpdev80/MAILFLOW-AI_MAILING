"use client";

import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import styles from "../admin-pages.module.css";
import { InstanceSystemPanel } from "./instance-system-panel";

const COPY = {
  de: {
    title: "Instanzverwaltung",
    description:
      "Zentrale Verwaltung von MailFlow als Plattform. Mailboxen und E-Mail-Inhalte bleiben bewusst außerhalb dieses Bereichs.",
    quick: "Administration",
    organizations: "Organisationen",
    organizationsText: "Mandanten, Organisations-Admins und Mitgliedschaften verwalten.",
    models: "KI & Modelle",
    modelsText: "Anbieter, Endpunkte, Zugangsdaten und Modellfreigaben zentral verwalten.",
    system: "System",
    systemText: "CPU, RAM, Dienste, Datenbank und Laufzeit überwachen.",
    updates: "Updates",
    updatesText: "Version, Update-Status und Rollback-Sicherheit verwalten.",
    backups: "Backups",
    backupsText: "Sicherungen, Restore-Punkte und Backup-Status verwalten.",
    certificates: "Zertifikate",
    certificatesText: "TLS-Zertifikat, Gültigkeit und Ablauf überwachen.",
  },
  en: {
    title: "Instance administration",
    description:
      "Central administration of MailFlow as a platform. Mailboxes and email content intentionally remain outside this area.",
    quick: "Administration",
    organizations: "Organizations",
    organizationsText: "Manage tenants, organization admins and memberships.",
    models: "AI & Models",
    modelsText: "Manage providers, endpoints, credentials and model access centrally.",
    system: "System",
    systemText: "Monitor CPU, memory, services, database and runtime.",
    updates: "Updates",
    updatesText: "Manage version, update status and rollback safety.",
    backups: "Backups",
    backupsText: "Manage backups, restore points and backup status.",
    certificates: "Certificates",
    certificatesText: "Monitor TLS certificate validity and expiry.",
  },
  es: {
    title: "Administración de instancia",
    description:
      "Administración central de MailFlow como plataforma. Los buzones y correos permanecen fuera de esta área.",
    quick: "Administración",
    organizations: "Organizaciones",
    organizationsText: "Gestiona organizaciones, administradores y miembros.",
    models: "IA y modelos",
    modelsText: "Gestiona proveedores, endpoints, credenciales y accesos a modelos de forma central.",
    system: "Sistema",
    systemText: "Supervisa CPU, memoria, servicios, base de datos y ejecución.",
    updates: "Actualizaciones",
    updatesText: "Gestiona versión, actualizaciones y seguridad de rollback.",
    backups: "Copias de seguridad",
    backupsText: "Gestiona copias, puntos de restauración y estado.",
    certificates: "Certificados",
    certificatesText: "Supervisa validez y caducidad del certificado TLS.",
  },
} as const;

export default function InstanceAdminPage() {
  const { locale } = useI18n();
  const copy = COPY[locale];

  const links = [
    {
      href: "/admin/instance/organizations",
      title: copy.organizations,
      text: copy.organizationsText,
    },
    {
      href: "/admin/instance/models",
      title: copy.models,
      text: copy.modelsText,
    },
    { href: "/admin/instance/system", title: copy.system, text: copy.systemText },
    { href: "/admin/instance/updates", title: copy.updates, text: copy.updatesText },
    { href: "/admin/instance/backups", title: copy.backups, text: copy.backupsText },
    {
      href: "/admin/instance/certificates",
      title: copy.certificates,
      text: copy.certificatesText,
    },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </header>

      <InstanceSystemPanel compact />

      <section>
        <div className={styles.sectionHeader}>
          <h2>{copy.quick}</h2>
        </div>
        <div className={styles.adminGrid}>
          {links.map((item) => (
            <Link key={item.href} href={item.href} className={styles.adminCard}>
              <strong>{item.title}</strong>
              <span>{item.text}</span>
              <span className={styles.adminArrow}>→</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
