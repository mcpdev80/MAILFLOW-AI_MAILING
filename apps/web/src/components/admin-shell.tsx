"use client";

import { useAccessContext } from "@/lib/access-context";
import { authClient, useSession } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "./admin-shell.module.css";

type Plane = "instance" | "organization";
type Copy = {
  plane: string;
  overview: string;
  organizations: string;
  system: string;
  updates: string;
  backups: string;
  certificates: string;
  members: string;
  models: string;
  context: string;
  instance: string;
  orgAdmin: string;
  mail: string;
  loading: string;
};

const COPY: Record<"de" | "en" | "es", Copy> = {
  de: {
    plane: "Verwaltungsbereich",
    overview: "Übersicht",
    organizations: "Organisationen",
    system: "System",
    updates: "Updates",
    backups: "Backups",
    certificates: "Zertifikate",
    members: "Mitglieder",
    models: "KI & Modelle",
    context: "Bereich wechseln",
    instance: "Instanzverwaltung",
    orgAdmin: "Organisationsverwaltung",
    mail: "Mail",
    loading: "Berechtigungen werden geprüft …",
  },
  en: {
    plane: "Administration area",
    overview: "Overview",
    organizations: "Organizations",
    system: "System",
    updates: "Updates",
    backups: "Backups",
    certificates: "Certificates",
    members: "Members",
    models: "AI & Models",
    context: "Switch area",
    instance: "Instance administration",
    orgAdmin: "Organization administration",
    mail: "Mail",
    loading: "Checking permissions …",
  },
  es: {
    plane: "Área de administración",
    overview: "Resumen",
    organizations: "Organizaciones",
    system: "Sistema",
    updates: "Actualizaciones",
    backups: "Copias",
    certificates: "Certificados",
    members: "Miembros",
    models: "IA y modelos",
    context: "Cambiar área",
    instance: "Administración de instancia",
    orgAdmin: "Administración de organización",
    mail: "Correo",
    loading: "Comprobando permisos …",
  },
};

function isOrgAdmin(role: string): boolean {
  return role === "owner" || role === "admin";
}

export function AdminShell({
  plane,
  children,
}: {
  plane: Plane;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale } = useI18n();
  const copy = COPY[locale];
  const { context } = useAccessContext();
  const user = useSession().data?.user;
  const [switching, setSwitching] = useState(false);

  const adminOrganizations = useMemo(
    () => context?.organizations.filter((org) => isOrgAdmin(org.role)) ?? [],
    [context],
  );
  const activeOrganization = context?.organizations.find(
    (org) => org.id === context.active_organization_id,
  );

  useEffect(() => {
    if (!context?.authenticated) return;
    if (plane === "instance" && !context.instance_role) {
      router.replace(
        adminOrganizations.length > 0 ? "/admin/org" : "/app/dashboard",
      );
      return;
    }
    if (plane === "organization" && adminOrganizations.length === 0) {
      router.replace(
        context.instance_role ? "/admin/instance" : "/app/dashboard",
      );
    }
  }, [adminOrganizations.length, context, plane, router]);

  if (!context) {
    return <div className={styles.loading}>{copy.loading}</div>;
  }

  const allowed =
    plane === "instance"
      ? Boolean(context.instance_role)
      : adminOrganizations.length > 0;
  if (!allowed) {
    return <div className={styles.loading}>{copy.loading}</div>;
  }

  const items =
    plane === "instance"
      ? [
          { href: "/admin/instance", label: copy.overview, glyph: "▦" },
          {
            href: "/admin/instance/organizations",
            label: copy.organizations,
            glyph: "□",
          },
          { href: "/admin/instance/system", label: copy.system, glyph: "◉" },
          { href: "/admin/instance/updates", label: copy.updates, glyph: "↻" },
          { href: "/admin/instance/backups", label: copy.backups, glyph: "▣" },
          {
            href: "/admin/instance/certificates",
            label: copy.certificates,
            glyph: "◇",
          },
        ]
      : [
          { href: "/admin/org", label: copy.overview, glyph: "▦" },
          { href: "/admin/org/members", label: copy.members, glyph: "○" },
          { href: "/admin/org/models", label: copy.models, glyph: "◇" },
        ];

  async function switchArea(value: string) {
    if (!value || switching) return;
    setSwitching(true);
    try {
      if (value === "instance") {
        router.push("/admin/instance");
        return;
      }
      const [target, organizationId] = value.split(":", 2);
      if (!organizationId) return;
      const result = await authClient.organization.setActive({ organizationId });
      if (result.error)
        throw new Error(result.error.message ?? "set_active_failed");
      router.push(target === "org" ? "/admin/org" : "/app/dashboard");
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  const currentValue =
    plane === "instance"
      ? "instance"
      : activeOrganization && isOrgAdmin(activeOrganization.role)
        ? `org:${activeOrganization.id}`
        : "";

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div>
          <Link
            href={plane === "instance" ? "/admin/instance" : "/admin/org"}
            className={styles.brand}
          >
            <span className={styles.brandMark}>M</span>
            <span>MailFlow</span>
          </Link>
          <div className={styles.plane}>
            <span className={styles.planeLabel}>{copy.plane}</span>
            <strong>
              {plane === "instance" ? copy.instance : copy.orgAdmin}
            </strong>
          </div>
          <nav className={styles.nav}>
            {items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                >
                  <span className={styles.glyph} aria-hidden="true">
                    {item.glyph}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className={styles.context}>
          <label htmlFor="mailflow-area-switcher">{copy.context}</label>
          <select
            id="mailflow-area-switcher"
            value={currentValue}
            disabled={switching}
            onChange={(event) => void switchArea(event.currentTarget.value)}
          >
            {context.instance_role && (
              <option value="instance">{copy.instance}</option>
            )}
            {adminOrganizations.map((org) => (
              <option key={`org:${org.id}`} value={`org:${org.id}`}>
                {copy.orgAdmin}: {org.name}
              </option>
            ))}
            {context.organizations.map((org) => (
              <option key={`mail:${org.id}`} value={`mail:${org.id}`}>
                {copy.mail}: {org.name}
              </option>
            ))}
          </select>
          <div className={styles.profile}>{user?.email ?? ""}</div>
        </div>
      </aside>
      <div className={styles.content}>
        <header className={styles.header}>
          <span className={styles.headerTitle}>
            {plane === "instance"
              ? copy.instance
              : (activeOrganization?.name ?? copy.orgAdmin)}
          </span>
          <span className={styles.rolePill}>
            {plane === "instance"
              ? context.instance_role
              : (activeOrganization?.role ?? "admin")}
          </span>
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
