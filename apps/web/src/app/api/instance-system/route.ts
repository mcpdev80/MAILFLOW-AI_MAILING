import { readFile } from "node:fs/promises";
import os from "node:os";
import { connect as tlsConnect } from "node:tls";
import { auth, authEnabled } from "@/lib/auth";
import { getInstanceRole } from "@/lib/instance-admin";
import { API_INTERNAL_URL } from "@/lib/server-api";
import { type NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

type ApiHealth = {
  status?: string;
  db?: string;
  redis?: string;
  version?: string;
  latency_ms?: number;
};

type ApiStatus = ApiHealth & {
  reachable: boolean;
  http_status?: number;
};

async function requireInstanceAdmin(request: NextRequest) {
  if (!authEnabled || !auth) return null;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const role = await getInstanceRole(session.user.id);
  return role ? { session, role } : null;
}

function parseMeminfo(raw: string) {
  const values = new Map<string, number>();
  for (const line of raw.split("\n")) {
    const match = line.match(/^([^:]+):\s+(\d+)/);
    if (match) values.set(match[1], Number(match[2]) * 1024);
  }
  const total = values.get("MemTotal") ?? os.totalmem();
  const available = values.get("MemAvailable") ?? os.freemem();
  const used = Math.max(0, total - available);
  return {
    total_bytes: total,
    used_bytes: used,
    available_bytes: available,
    used_percent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
  };
}

async function readCpuSample() {
  const raw = await readFile("/proc/stat", "utf8");
  const line = raw.split("\n").find((entry) => entry.startsWith("cpu "));
  if (!line) return null;
  const values = line.trim().split(/\s+/).slice(1).map(Number);
  const idle = (values[3] ?? 0) + (values[4] ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  return { idle, total };
}

async function cpuUsagePercent() {
  try {
    const first = await readCpuSample();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const second = await readCpuSample();
    if (!first || !second) return null;
    const total = second.total - first.total;
    const idle = second.idle - first.idle;
    if (total <= 0) return null;
    return Math.round((100 - (idle / total) * 100) * 10) / 10;
  } catch {
    return null;
  }
}

async function getApiStatus(): Promise<ApiStatus> {
  try {
    const response = await fetch(`${API_INTERNAL_URL}/health`, {
      cache: "no-store",
    });
    return {
      reachable: true,
      http_status: response.status,
      ...((await response.json()) as ApiHealth),
    };
  } catch {
    return {
      reachable: false,
      status: "down",
      db: "unknown",
      redis: "unknown",
    };
  }
}

async function certificateStatus() {
  const publicUrl = process.env.MAILFLOW_PUBLIC_URL;
  if (!publicUrl) return { configured: false as const };
  let url: URL;
  try {
    url = new URL(publicUrl);
  } catch {
    return { configured: false as const };
  }
  if (url.protocol !== "https:") {
    return {
      configured: true as const,
      https: false as const,
      host: url.hostname,
    };
  }

  const production = process.env.NODE_ENV === "production";
  const probeHost = production ? "edge" : url.hostname;
  const probePort = production ? 443 : Number(url.port || 443);
  return await new Promise<Record<string, unknown>>((resolve) => {
    const socket = tlsConnect(
      {
        host: probeHost,
        port: probePort,
        servername: url.hostname,
        rejectUnauthorized: false,
        timeout: 4000,
      },
      () => {
        const cert = socket.getPeerCertificate();
        const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
        const daysRemaining = validTo
          ? Math.floor((validTo.getTime() - Date.now()) / 86_400_000)
          : null;
        resolve({
          configured: true,
          https: true,
          host: url.hostname,
          issuer: cert.issuer?.O ?? cert.issuer?.CN ?? null,
          subject: cert.subject?.CN ?? null,
          valid_to: validTo?.toISOString() ?? null,
          days_remaining: daysRemaining,
          authorized: socket.authorized,
          authorization_error: socket.authorizationError ?? null,
        });
        socket.end();
      },
    );
    socket.on("timeout", () => {
      socket.destroy();
      resolve({
        configured: true,
        https: true,
        host: url.hostname,
        error: "timeout",
      });
    });
    socket.on("error", (error) =>
      resolve({
        configured: true,
        https: true,
        host: url.hostname,
        error: error.message,
      }),
    );
  });
}

export async function GET(request: NextRequest) {
  const caller = await requireInstanceAdmin(request);
  if (!caller) {
    return NextResponse.json(
      { detail: "instance_admin_required" },
      { status: 403 },
    );
  }

  const [
    apiResult,
    databaseResult,
    countsResult,
    memoryRaw,
    cpuPercent,
    certificate,
  ] = await Promise.all([
    getApiStatus(),
    pool.query<{ size_bytes: string }>(
      "select pg_database_size(current_database())::text as size_bytes",
    ),
    pool.query<{
      users: number;
      organizations: number;
      instance_admins: number;
    }>(`select
        (select count(*)::int from "user") as users,
        (select count(*)::int from "organization") as organizations,
        (select count(*)::int from "mailflow_instance_admin") as instance_admins`),
    readFile("/proc/meminfo", "utf8").catch(() => ""),
    cpuUsagePercent(),
    certificateStatus(),
  ]);

  const memory = memoryRaw
    ? parseMeminfo(memoryRaw)
    : {
        total_bytes: os.totalmem(),
        used_bytes: os.totalmem() - os.freemem(),
        available_bytes: os.freemem(),
        used_percent:
          Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 1000) /
          10,
      };
  const counts = countsResult.rows[0] ?? {
    users: 0,
    organizations: 0,
    instance_admins: 0,
  };

  return NextResponse.json({
    status:
      apiResult.reachable && apiResult.status === "ok" ? "ok" : "degraded",
    checked_at: new Date().toISOString(),
    runtime: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpu_count: os.cpus().length,
      cpu_percent: cpuPercent,
      load_1m: os.loadavg()[0],
      load_5m: os.loadavg()[1],
      load_15m: os.loadavg()[2],
      memory,
      uptime_seconds: os.uptime(),
    },
    services: {
      api: apiResult,
      postgres: {
        status: apiResult.db ?? "unknown",
        size_bytes: Number(databaseResult.rows[0]?.size_bytes ?? 0),
      },
      redis: { status: apiResult.redis ?? "unknown" },
    },
    counts,
    certificate,
    deployment: {
      public_url: process.env.MAILFLOW_PUBLIC_URL ?? null,
      tls_mode: process.env.MAILFLOW_TLS_MODE ?? null,
      source: process.env.MAILFLOW_DEPLOYMENT_SOURCE ?? "compose",
    },
  });
}
