"use client";

import { useI18n } from "@/lib/i18n";
import styles from "../../admin-pages.module.css";

const COPY = {
  de: {
    title: "Updates",
    description: "Update-Verwaltung der MailFlow-Instanz über BaseHarbor.",
    current: "Sicherer Update-Pfad",
    text: "Bei einer BaseHarbor-Installation wird MailFlow über BaseHarbor aktualisiert. BaseHarbor prüft den Git-Stand und führt die Aktualisierung anschließend über den normalen Application-Reconciliation-Pfad aus.",
    checkCommand: "Auf Updates prüfen",
    updateCommand: "MailFlow aktualisieren",
    security: "Warum nicht direkt im Browser?",
    securityText: "Ein Web-Container mit Docker-Socket oder beliebiger Shell-Ausführung hätte praktisch Root-Zugriff auf den Host. MailFlow führt deshalb keine privilegierten Host-Updates aus dem Browser aus. Die Aktualisierung bleibt bewusst beim BaseHarbor-CLI auf dem Host.",
  },
  en: {
    title: "Updates",
    description: "Update management for this MailFlow instance through BaseHarbor.",
    current: "Safe update path",
    text: "For a BaseHarbor installation, MailFlow is updated through BaseHarbor. BaseHarbor checks the Git state and then applies the update through the normal application reconciliation path.",
    checkCommand: "Check for updates",
    updateCommand: "Update MailFlow",
    security: "Why not directly in the browser?",
    securityText: "Giving the web container Docker socket or arbitrary shell access would effectively provide host root access. MailFlow therefore does not run privileged host updates from the browser. Updates intentionally remain with the BaseHarbor CLI on the host.",
  },
  es: {
    title: "Actualizaciones",
    description: "Gestión de actualizaciones de esta instancia de MailFlow mediante BaseHarbor.",
    current: "Ruta de actualización segura",
    text: "En una instalación con BaseHarbor, MailFlow se actualiza mediante BaseHarbor. BaseHarbor comprueba el estado de Git y después aplica la actualización mediante la ruta normal de reconciliación de la aplicación.",
    checkCommand: "Buscar actualizaciones",
    updateCommand: "Actualizar MailFlow",
    security: "¿Por qué no desde el navegador?",
    securityText: "Dar al contenedor web acceso al socket Docker o a una shell arbitraria equivaldría prácticamente a acceso root al host. Por eso MailFlow no ejecuta actualizaciones privilegiadas del host desde el navegador. Las actualizaciones permanecen deliberadamente en la CLI de BaseHarbor en el host.",
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
        <strong>{copy.checkCommand}</strong>
        <code className={styles.command}>baha app update --check</code>
        <strong>{copy.updateCommand}</strong>
        <code className={styles.command}>baha app update</code>
      </section>
      <section className={styles.card}>
        <h2>{copy.security}</h2>
        <p>{copy.securityText}</p>
      </section>
    </div>
  );
}
