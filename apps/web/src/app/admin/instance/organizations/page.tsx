"use client";

import { useI18n } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import styles from "../../admin-pages.module.css";

type Organization = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  member_count: number;
  admin_count: number;
};

const COPY = {
  de: {
    title: "Organisationen",
    description:
      "Organisationen gehören zur Instanzverwaltung. Der Superadmin wird beim Anlegen nicht automatisch Mitglied der Organisation.",
    name: "Name",
    slug: "Slug",
    admin: "Initialer Organisations-Admin (optional)",
    adminHint: "E-Mail eines bereits vorhandenen Benutzers",
    create: "Organisation anlegen",
    creating: "Wird angelegt …",
    members: "Mitglieder",
    admins: "Admins",
    created: "Erstellt",
    empty: "Noch keine Organisationen vorhanden.",
  },
  en: {
    title: "Organizations",
    description:
      "Organizations belong to instance administration. Creating one does not automatically make the super admin a member.",
    name: "Name",
    slug: "Slug",
    admin: "Initial organization admin (optional)",
    adminHint: "Email of an existing user",
    create: "Create organization",
    creating: "Creating …",
    members: "Members",
    admins: "Admins",
    created: "Created",
    empty: "No organizations yet.",
  },
  es: {
    title: "Organizaciones",
    description:
      "Las organizaciones pertenecen a la administración de instancia. El superadministrador no se añade automáticamente como miembro.",
    name: "Nombre",
    slug: "Slug",
    admin: "Administrador inicial (opcional)",
    adminHint: "Correo de un usuario existente",
    create: "Crear organización",
    creating: "Creando …",
    members: "Miembros",
    admins: "Admins",
    created: "Creada",
    empty: "Aún no hay organizaciones.",
  },
} as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export default function InstanceOrganizationsPage() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/instance-organizations", { cache: "no-store" });
    if (!response.ok) throw new Error(`organizations_load_failed:${response.status}`);
    const payload = (await response.json()) as { organizations: Organization[] };
    setOrganizations(payload.organizations);
  }, []);

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : "organizations_load_failed"),
    );
  }, [load]);

  async function createOrganization() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/instance-organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          admin_email: adminEmail || undefined,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { detail?: string }
          | null;
        throw new Error(payload?.detail ?? `organization_create_failed:${response.status}`);
      }
      setName("");
      setSlug("");
      setAdminEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "organization_create_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </header>

      <div className={styles.form}>
        <label>
          {copy.name}
          <input
            value={name}
            onChange={(event) => {
              const next = event.currentTarget.value;
              setName(next);
              if (!slug || slug === slugify(name)) setSlug(slugify(next));
            }}
          />
        </label>
        <label>
          {copy.slug}
          <input value={slug} onChange={(event) => setSlug(event.currentTarget.value)} />
        </label>
        <label>
          {copy.admin}
          <input
            type="email"
            placeholder={copy.adminHint}
            value={adminEmail}
            onChange={(event) => setAdminEmail(event.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          className="btn"
          disabled={busy || !name.trim() || !slug.trim()}
          onClick={() => void createOrganization()}
        >
          {busy ? copy.creating : copy.create}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{copy.name}</th>
              <th>{copy.slug}</th>
              <th>{copy.members}</th>
              <th>{copy.admins}</th>
              <th>{copy.created}</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((organization) => (
              <tr key={organization.id}>
                <td>{organization.name}</td>
                <td>{organization.slug}</td>
                <td>{organization.member_count}</td>
                <td>{organization.admin_count}</td>
                <td>{new Date(organization.created_at).toLocaleDateString(locale)}</td>
              </tr>
            ))}
            {organizations.length === 0 && (
              <tr>
                <td colSpan={5}>{copy.empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
