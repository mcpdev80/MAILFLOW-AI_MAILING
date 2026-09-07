import { randomUUID } from "node:crypto";
import { auth, authEnabled } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { getInstanceRole } from "@/lib/instance-admin";
import { provisionOrg } from "@/lib/provision";
import { type NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function requireInstanceAdmin(request: NextRequest) {
  if (!authEnabled || !auth) return null;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const role = await getInstanceRole(session.user.id);
  return role ? { session, role } : null;
}

export async function GET(request: NextRequest) {
  const caller = await requireInstanceAdmin(request);
  if (!caller) {
    return NextResponse.json({ detail: "instance_admin_required" }, { status: 403 });
  }

  const result = await pool.query<{
    id: string;
    name: string;
    slug: string;
    created_at: string;
    member_count: number;
    admin_count: number;
  }>(`
    select
      o.id,
      o.name,
      o.slug,
      o."createdAt"::text as created_at,
      count(m.id)::int as member_count,
      count(m.id) filter (where m.role in ('owner', 'admin'))::int as admin_count
    from "organization" o
    left join "member" m on m."organizationId" = o.id
    group by o.id, o.name, o.slug, o."createdAt"
    order by lower(o.name), o.id
  `);

  return NextResponse.json({ organizations: result.rows });
}

export async function POST(request: NextRequest) {
  const caller = await requireInstanceAdmin(request);
  if (!caller) {
    return NextResponse.json({ detail: "instance_admin_required" }, { status: 403 });
  }

  const payload = (await request.json()) as {
    name?: unknown;
    slug?: unknown;
    admin_email?: unknown;
  };
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const slug = typeof payload.slug === "string" ? payload.slug.trim().toLowerCase() : "";
  const adminEmail =
    typeof payload.admin_email === "string"
      ? payload.admin_email.trim().toLowerCase()
      : "";

  if (!name) {
    return NextResponse.json({ detail: "name_required" }, { status: 422 });
  }
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) {
    return NextResponse.json({ detail: "invalid_slug" }, { status: 422 });
  }

  const client = await pool.connect();
  const organizationId = randomUUID();
  try {
    await client.query("begin");

    const duplicate = await client.query(
      'select 1 from "organization" where slug = $1 limit 1',
      [slug],
    );
    if ((duplicate.rowCount ?? 0) > 0) {
      await client.query("rollback");
      return NextResponse.json({ detail: "slug_exists" }, { status: 409 });
    }

    let adminUserId: string | null = null;
    if (adminEmail) {
      const user = await client.query<{ id: string }>(
        'select id from "user" where lower(email) = $1 limit 1',
        [adminEmail],
      );
      adminUserId = user.rows[0]?.id ?? null;
      if (!adminUserId) {
        await client.query("rollback");
        return NextResponse.json(
          { detail: "admin_user_not_found" },
          { status: 422 },
        );
      }
    }

    await client.query(
      `insert into "organization" (id, name, slug, "createdAt", metadata)
       values ($1, $2, $3, now(), '{}')`,
      [organizationId, name, slug],
    );

    if (adminUserId) {
      await client.query(
        `insert into "member" (id, "organizationId", "userId", role, "createdAt")
         values ($1, $2, $3, 'owner', now())`,
        [randomUUID(), organizationId, adminUserId],
      );
    }

    const provisioned = await provisionOrg({ name, slug });
    const metadata = JSON.stringify({
      mf_org_id: provisioned.org_id,
      mf_api_key_enc: encryptSecret(provisioned.api_key),
    });
    await client.query('update "organization" set metadata = $1 where id = $2', [
      metadata,
      organizationId,
    ]);

    await client.query("commit");
    return NextResponse.json(
      {
        id: organizationId,
        name,
        slug,
        initial_admin: adminEmail || null,
      },
      { status: 201 },
    );
  } catch (error) {
    await client.query("rollback");
    console.error("Failed to create instance organization", error);
    return NextResponse.json(
      { detail: "organization_create_failed" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
