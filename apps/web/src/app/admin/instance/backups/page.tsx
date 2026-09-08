"use client";

import { useI18n } from "@/lib/i18n";
import styles from "../../admin-pages.module.css";

const COPY = {
  de: {
    title: "Backups",
    description: "Sicherung und Wiederherstellung der MailFlow-Instanz.",
    coverage: "Vollständiger Sicherungsumfang",
    coverageText: "MailFlow sichert PostgreSQL, lokale Konfiguration, TLS-Dateien und das Attachment-Volume. Updates erzeugen automatisch einen Restore-Punkt bevor Änderungen vorgenommen werden.",
    create: "Backup auf dem Host erstellen",
    restore: "Backup wiederherstellen",
    warning: "Restore ist eine privilegierte und destruktive Host-Operation. Die Web-Oberfläche führt sie deshalb nicht über einen Docker-Socket aus.",
  },
  en: {
    title: "Backups",
    description: "Backup and restore for the MailFlow instance.",
    coverage: "Full backup scope",
    coverageText: "MailFlow backs up PostgreSQL, local configuration, TLS files and the attachment volume. Updates automatically create a restore point before making changes.",
    create: "Create backup on the host",
    restore: "Restore a backup",
    warning: "Restore is a privileged and destructive host operation. The web UI therefore does not execute it through a Docker socket.",
  },
  es: {
    title: "Copias de seguridad",
    description: "Copia y restauración de la instancia MailFlow.",
    coverage: "Contenido de la copia completa",
    coverageText: "MailFlow guarda PostgreSQL, configuración local, TLS y adjuntos. Las actualizaciones crean automáticamente un punto de restauración.",
    create: "Crear copia en el host",
    restore: "Restaurar una copia",
    warning: "La restauración es una operación privilegiada y destructiva del host y no se ejecuta mediante el socket Docker desde la web.",
  },
} as const;

export default function InstanceBackupsPage() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </header>
      <section className={styles.card}>
        <h2>{copy.coverage}</h2>
        <p>{copy.coverageText}</p>
      </section>
      <div className={styles.grid}>
        <section className={styles.card}>
          <h2>{copy.create}</h2>
          <code className={styles.command}>bash ./mailflow backup</code>
        </section>
        <section className={styles.card}>
          <h2>{copy.restore}</h2>
          <code className={styles.command}>bash ./mailflow restore &lt;backup-directory&gt;</code>
        </section>
      </div>
      <p className={styles.note}>{copy.warning}</p>
    </div>
  );
}
