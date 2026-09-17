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
    managementText: "Die Zertifikatsverwaltung erfolgt auf dem Host über BaseHarbor. Automatisch verwaltete ACME-Zertifikate bleiben beim jeweiligen TLS-Provider. Bei vorhandenen eigenen Zertifikaten prüft BaseHarbor Quelle, Zertifikat, privaten Schlüssel, FQDN und Ablaufzeit und kann ein neueres Zertifikat sicher übernehmen. MailFlow selbst erhält keinen Zugriff auf private Schlüssel.",
    check: "Auf Zertifikats-Update prüfen",
    update: "Neueres Zertifikat übernehmen",
  },
  en: {
    title: "Certificates",
    description: "TLS state of the publicly reachable MailFlow instance.",
    info: "MailFlow checks the certificate actually served by the public HTTPS endpoint. Expiry, certificate name and reachability are verified without exposing the private key to the web application.",
    management: "Certificate management",
    managementText: "Certificate lifecycle management runs on the host through BaseHarbor. Automatically managed ACME certificates remain with the selected TLS provider. For existing custom certificates, BaseHarbor validates the source, certificate, private key, FQDN and expiry and can safely import a newer certificate. MailFlow never receives access to private keys.",
    check: "Check for certificate update",
    update: "Install newer certificate",
  },
  es: {
    title: "Certificados",
    description: "Estado TLS de la instancia pública de MailFlow.",
    info: "MailFlow comprueba el certificado realmente servido por HTTPS sin exponer la clave privada a la aplicación web.",
    management: "Gestión de certificados",
    managementText: "La gestión del ciclo de vida del certificado se realiza en el host mediante BaseHarbor. Los certificados ACME automáticos siguen siendo responsabilidad del proveedor TLS. Para certificados propios existentes, BaseHarbor valida origen, certificado, clave privada, FQDN y caducidad, y puede importar de forma segura un certificado más reciente. MailFlow no recibe acceso a claves privadas.",
    check: "Comprobar actualización del certificado",
    update: "Instalar certificado más reciente",
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
        <strong>{copy.check}</strong>
        <code className={styles.command}>baha app tls update --check</code>
        <strong>{copy.update}</strong>
        <code className={styles.command}>baha app tls update</code>
      </section>
    </div>
  );
}
