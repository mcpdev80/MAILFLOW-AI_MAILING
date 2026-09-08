"use client";

import { useI18n } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import styles from "../admin-pages.module.css";

type SystemStatus = {
  status: "ok" | "degraded";
  checked_at: string;
  runtime: {
    hostname: string;
    platform: string;
    arch: string;
    cpu_count: number;
    cpu_percent: number | null;
    load_1m: number;
    load_5m: number;
    load_15m: number;
    memory: {
      total_bytes: number;
      used_bytes: number;
      available_bytes: number;
      used_percent: number;
    };
    uptime_seconds: number;
  };
  services: {
    api: {
      reachable?: boolean;
      status?: string;
      version?: string;
      latency_ms?: number;
    };
    postgres: { status: string; size_bytes: number };
    redis: { status: string };
  };
  counts: { users: number; organizations: number; instance_admins: number };
  certificate: {
    configured?: boolean;
    https?: boolean;
    host?: string;
    issuer?: string | null;
    subject?: string | null;
    valid_to?: string | null;
    days_remaining?: number | null;
    authorized?: boolean;
    authorization_error?: string | null;
    error?: string;
  };
  deployment: {
    public_url: string | null;
    tls_mode: string | null;
    source: string;
  };
};

const COPY = {
  de: {
    loading: "Systemstatus wird geladen …",
    failed: "Systemstatus konnte nicht geladen werden.",
    overall: "Gesamtstatus",
    healthy: "Betriebsbereit",
    degraded: "Beeinträchtigt",
    api: "API",
    postgres: "PostgreSQL",
    redis: "Redis",
    cpu: "CPU",
    memory: "Arbeitsspeicher",
    database: "Datenbankgröße",
    uptime: "Host-Uptime",
    organizations: "Organisationen",
    users: "Benutzer",
    admins: "Instanz-Admins",
    certificate: "TLS-Zertifikat",
    days: "Tage",
    refresh: "Aktualisieren",
    checked: "Zuletzt geprüft",
  },
  en: {
    loading: "Loading system status …",
    failed: "System status could not be loaded.",
    overall: "Overall status",
    healthy: "Operational",
    degraded: "Degraded",
    api: "API",
    postgres: "PostgreSQL",
    redis: "Redis",
    cpu: "CPU",
    memory: "Memory",
    database: "Database size",
    uptime: "Host uptime",
    organizations: "Organizations",
    users: "Users",
    admins: "Instance admins",
    certificate: "TLS certificate",
    days: "days",
    refresh: "Refresh",
    checked: "Last checked",
  },
  es: {
    loading: "Cargando estado del sistema …",
    failed: "No se pudo cargar el estado del sistema.",
    overall: "Estado general",
    healthy: "Operativo",
    degraded: "Degradado",
    api: "API",
    postgres: "PostgreSQL",
    redis: "Redis",
    cpu: "CPU",
    memory: "Memoria",
    database: "Tamaño de base de datos",
    uptime: "Tiempo activo del host",
    organizations: "Organizaciones",
    users: "Usuarios",
    admins: "Admins de instancia",
    certificate: "Certificado TLS",
    days: "días",
    refresh: "Actualizar",
    checked: "Última comprobación",
  },
} as const;

function bytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
}

function uptime(value: number): string {
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

function ServiceState({ value }: { value: string | undefined }) {
  const ok = value === "up" || value === "ok";
  return (
    <span className={`${styles.statusBadge} ${ok ? styles.statusOk : styles.statusBad}`}>
      <span className={styles.statusDot} />
      {value ?? "unknown"}
    </span>
  );
}

export function InstanceSystemPanel({ compact = false }: { compact?: boolean }) {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/instance-system", { cache: "no-store" });
      if (!response.ok) throw new Error(`status:${response.status}`);
      setStatus((await response.json()) as SystemStatus);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (loading && !status) return <p className={styles.note}>{copy.loading}</p>;
  if (error && !status) return <p className={styles.error}>{copy.failed}</p>;
  if (!status) return null;

  const certDays = status.certificate.days_remaining;

  return (
    <section className={styles.systemSection}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>{copy.overall}</h2>
          <span className={styles.mutedText}>
            {copy.checked}: {new Date(status.checked_at).toLocaleTimeString(locale)}
          </span>
        </div>
        <button type="button" className="btn" disabled={loading} onClick={() => void load()}>
          {copy.refresh}
        </button>
      </div>

      <div className={styles.healthGrid}>
        <article className={styles.healthCard}>
          <span>{copy.overall}</span>
          <strong>{status.status === "ok" ? copy.healthy : copy.degraded}</strong>
          <ServiceState value={status.status} />
        </article>
        <article className={styles.healthCard}>
          <span>{copy.api}</span>
          <strong>{status.services.api.latency_ms ?? "–"} ms</strong>
          <ServiceState value={status.services.api.status} />
        </article>
        <article className={styles.healthCard}>
          <span>{copy.postgres}</span>
          <strong>{bytes(status.services.postgres.size_bytes)}</strong>
          <ServiceState value={status.services.postgres.status} />
        </article>
        <article className={styles.healthCard}>
          <span>{copy.redis}</span>
          <strong>Queue / Cache</strong>
          <ServiceState value={status.services.redis.status} />
        </article>
      </div>

      <div className={styles.resourceGrid}>
        <article className={styles.card}>
          <h3>{copy.cpu}</h3>
          <div className={styles.metric}>{status.runtime.cpu_percent ?? "–"}%</div>
          <p>{status.runtime.cpu_count} CPUs · Load {status.runtime.load_1m.toFixed(2)}</p>
        </article>
        <article className={styles.card}>
          <h3>{copy.memory}</h3>
          <div className={styles.metric}>{status.runtime.memory.used_percent}%</div>
          <p>{bytes(status.runtime.memory.used_bytes)} / {bytes(status.runtime.memory.total_bytes)}</p>
        </article>
        <article className={styles.card}>
          <h3>{copy.uptime}</h3>
          <div className={styles.metric}>{uptime(status.runtime.uptime_seconds)}</div>
          <p>{status.runtime.hostname}</p>
        </article>
        {!compact && (
          <article className={styles.card}>
            <h3>{copy.database}</h3>
            <div className={styles.metric}>{bytes(status.services.postgres.size_bytes)}</div>
            <p>PostgreSQL</p>
          </article>
        )}
      </div>

      {!compact && (
        <div className={styles.resourceGrid}>
          <article className={styles.card}>
            <h3>{copy.organizations}</h3>
            <div className={styles.metric}>{status.counts.organizations}</div>
          </article>
          <article className={styles.card}>
            <h3>{copy.users}</h3>
            <div className={styles.metric}>{status.counts.users}</div>
          </article>
          <article className={styles.card}>
            <h3>{copy.admins}</h3>
            <div className={styles.metric}>{status.counts.instance_admins}</div>
          </article>
          <article className={styles.card}>
            <h3>{copy.certificate}</h3>
            <div className={styles.metric}>{certDays == null ? "–" : `${certDays} ${copy.days}`}</div>
            <p>{status.certificate.subject ?? status.certificate.host ?? "–"}</p>
          </article>
        </div>
      )}
    </section>
  );
}
