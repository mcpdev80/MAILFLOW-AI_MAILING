"use client";

import { useI18n } from "@/lib/i18n";
import styles from "../../admin-pages.module.css";
import { InstanceSystemPanel } from "../instance-system-panel";

const COPY = {
  de: {
    title: "Zertifikate",
    description: "TLS-Zustand der öffentlich erreichbaren MailFlow-Instanz.",
    info: "MailFlow prüft das tatsächlich vom öffentlichen HTTPS-Endpunkt ausgelieferte Zertifikat. Dadurch werden Ablaufdatum, Zertifikatsname und Erreichbarkeit geprüft, ohne den privaten Schlüssel an die Web-Anwendung weiterzugeben.",
    management: "Zertifikatsverwaltung",
    managementText: "Automatisch verwaltete Caddy-Zertifikate werden von Caddy erneuert. Bei benutzerdefinierten Zertifikaten bleibt der private Schlüssel außerhalb des Admin-Dashboards; ein Austausch erfolgt über den geführten Host-Installer bzw. künftig über einen begrenzten Admin-Agenten.",
  },
  en: {
    title: "Certificates",
    description: "TLS state of the publicly reachable MailFlow instance.",
    info: "MailFlow checks the certificate actually served by the public HTTPS endpoint. Expiry, certificate name and reachability are verified without exposing the private key to the web application.",
    management: "Certificate management",
    managementText: "Caddy renews automatically managed certificates. Custom private keys stay outside the admin dashboard; replacement is performed through the guided host installer or a future narrow admin agent.",
  },
  es: {
    title: "Certificados",
    description: "Estado TLS de la instancia pública de MailFlow.",
    info: "MailFlow comprueba el certificado realmente servido por HTTPS sin exponer la clave privada a la aplicación web.",
    management: "Gestión de certificados",
    managementText: "Caddy renueva certificados automáticos. Las claves privadas personalizadas permanecen fuera del panel y se sustituyen mediante el instalador guiado o un agente administrativo limitado.",
  },
} as const;

export default function InstanceCertificatesPage() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </header>
      <InstanceSystemPanel />
      <section className={styles.card}>
        <h2>{copy.management}</h2>
        <p>{copy.info}</p>
        <p>{copy.managementText}</p>
      </section>
    </div>
  );
}
