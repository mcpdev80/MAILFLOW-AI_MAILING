"use client";

import { useI18n } from "@/lib/i18n";
import styles from "../../admin-pages.module.css";
import { InstanceSystemPanel } from "../instance-system-panel";

const COPY = {
  de: {
    title: "System",
    description:
      "Live-Zustand der MailFlow-Instanz. Die Werte werden alle 30 Sekunden aktualisiert.",
    note: "CPU, Arbeitsspeicher und Uptime werden aus der Linux-Laufzeit ermittelt. Dienste werden aktiv geprüft; PostgreSQL und Redis sind nicht nur statische Konfigurationswerte.",
  },
  en: {
    title: "System",
    description: "Live state of the MailFlow instance. Values refresh every 30 seconds.",
    note: "CPU, memory and uptime are read from the Linux runtime. Services are actively probed; PostgreSQL and Redis are not static configuration values.",
  },
  es: {
    title: "Sistema",
    description: "Estado en vivo de la instancia MailFlow. Los valores se actualizan cada 30 segundos.",
    note: "CPU, memoria y tiempo activo se obtienen del entorno Linux. PostgreSQL y Redis se comprueban activamente.",
  },
} as const;

export default function InstanceSystemPage() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </header>
      <InstanceSystemPanel />
      <p className={styles.note}>{copy.note}</p>
    </div>
  );
}
