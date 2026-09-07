import { auth, authEnabled } from "@/lib/auth";
import { getInstanceRole } from "@/lib/instance-admin";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(request: NextRequest) {
  if (!authEnabled || !auth) {
    return NextResponse.json({
      authenticated: true,
      user_id: null,
      instance_role: null,
      active_organization_id: null,
      organizations: [],
      recommended_area: "mail",
    });
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ detail: "not_authenticated" }, { status: 401 });
  }

  const [instanceRole, memberships] = await Promise.all([
    getInstanceRole(session.user.id),
    pool.query<{
      id: string;
      name: string;
      slug: string;
      role: string;
    }>(
      `select o.id, o.name, o.slug, m.role
       from "member" m
       join "organization" o on o.id = m."organizationId"
       where m."userId" = $1
       order by lower(o.name), o.id`,
      [session.user.id],
    ),
  ]);

  const activeOrganizationId = session.session.activeOrganizationId ?? null;
  const activeMembership = memberships.rows.find(
    (membership) => membership.id === activeOrganizationId,
  );
  const hasOrgAdmin = memberships.rows.some(
    (membership) => membership.role === "owner" || membership.role === "admin",
  );

  const recommendedArea = instanceRole
    ? "instance"
    : activeMembership &&
        (activeMembership.role === "owner" || activeMembership.role === "admin")
      ? "organization"
      : hasOrgAdmin
        ? "organization"
        : "mail";

  return NextResponse.json({
    authenticated: true,
    user_id: session.user.id,
    instance_role: instanceRole,
    active_organization_id: activeOrganizationId,
    organizations: memberships.rows,
    recommended_area: recommendedArea,
  });
}
