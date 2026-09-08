"use client";

import { useI18n } from "@/lib/i18n";
import styles from "../../admin-pages.module.css";

const COPY = {
  de: {
    title: "Updates",
    description: "Update- und Rollback-Verwaltung der MailFlow-Instanz.",
    current: "Sicherer Update-Pfad",
    text: "Der MailFlow-Updater prüft den Branch, erstellt vor jeder Änderung ein vollständiges Backup, führt Migrationen aus, prüft den Stack und rollt bei einem Fehler automatisch zurück.",
    command: "Update auf dem Host ausführen",
    security: "Warum nicht direkt im Browser?",
    securityText: "Ein Web-Container mit Docker-Socket oder beliebiger Shell-Ausführung wäre praktisch Root-Zugriff auf den Host. MailFlow trennt diese privilegierten Host-Operationen deshalb bewusst vom Web-Control-Plane. Ein eng begrenzter Admin-Agent ist dafür die nächste Ausbaustufe.",
  },
  en: {
    title: "Updates",
    description: "Update and rollback management for this MailFlow instance.",
    current: "Safe update path",
    text: "The MailFlow updater checks the branch, creates a full backup before changes, runs migrations, validates the stack and automatically rolls back on failure.",
    command: "Run update on the host",
    security: "Why not directly in the browser?",
    securityText: "Giving the web container Docker socket or arbitrary shell access is effectively host root access. Privileged host operations therefore stay separated until a narrow admin agent is available.",
  },
  es: {
    title: "Actualizaciones",
    description: "Gestión de actualizaciones y rollback de esta instancia.",
    current: "Ruta de actualización segura",
    text: "El actualizador crea una copia completa, ejecuta migraciones, valida el stack y revierte automáticamente si falla.",
    command: "Ejecutar actualización en el host",
    security: "¿Por qué no desde el navegador?",
    securityText: "Dar al contenedor web acceso al socket Docker o a una shell equivale prácticamente a acceso root al host. Estas operaciones permanecen separadas hasta disponer de un agente administrativo limitado.",
  },
} as const;

export default function InstanceUpdatesPage() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </header>
      <section className={styles.card}>
        <h2>{copy.current}</h2>
        <p>{copy.text}</p>
        <strong>{copy.command}</strong>
        <code className={styles.command}>bash ./mailflow update</code>
      </section>
      <section className={styles.card}>
        <h2>{copy.security}</h2>
        <p>{copy.securityText}</p>
      </section>
    </div>
  );
}
