/**
 * Server-side API authentication for the MailFlow BFF.
 *
 * The organization API key identifies the tenant. In authenticated multi-user
 * mode we additionally propagate signed Better Auth membership details so
 * FastAPI can enforce mailbox ownership and selective sharing without trusting
 * browser-supplied identity or role headers.
 */
import { createHmac } from "node:crypto";
import { Pool } from "pg";
import { auth, authEnabled } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";

export const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ?? "http://localhost:8000";

interface ActorIdentity {
  userId: string;
  orgId: string;
  authOrgId: string;
  role: string;
}

export type KeyResolution =
  | { ok: true; apiKey: string | null; actor: ActorIdentity | null }
  | { ok: false; status: number; error: string };

interface OrgMeta {
  mf_api_key_enc?: string;
  mf_org_id?: string;
}

const membershipDb = authEnabled
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

function parseMeta(raw: unknown): OrgMeta {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as OrgMeta;
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object") {
    return raw as OrgMeta;
  }
  return {};
}

async function resolveMemberRole(
  organizationId: string,
  userId: string,
): Promise<string | null> {
  if (!membershipDb) {
    return null;
  }
  const result = await membershipDb.query<{ role: string }>(
    'select role from "member" where "organizationId" = $1 and "userId" = $2 limit 1',
    [organizationId, userId],
  );
  return result.rows[0]?.role ?? null;
}

export async function resolveApiKey(
  reqHeaders: Headers,
): Promise<KeyResolution> {
  if (!authEnabled || !auth) {
    return {
      ok: true,
      apiKey: process.env.SINGLE_TENANT_API_KEY || null,
      actor: null,
    };
  }

  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) {
    return { ok: false, status: 401, error: "not_authenticated" };
  }

  const authOrgId = session.session.activeOrganizationId;
  if (!authOrgId) {
    return { ok: false, status: 400, error: "no_active_organization" };
  }

  const org = await auth.api.getFullOrganization({
    headers: reqHeaders,
    query: { organizationId: authOrgId },
  });
  if (!org) {
    return { ok: false, status: 400, error: "no_active_organization" };
  }

  const meta = parseMeta((org as { metadata?: unknown }).metadata);
  if (!meta.mf_api_key_enc || !meta.mf_org_id) {
    return { ok: false, status: 500, error: "organization_not_provisioned" };
  }
  if (!process.env.INTERNAL_API_SECRET) {
    return { ok: false, status: 500, error: "actor_signing_not_configured" };
  }

  const role = await resolveMemberRole(authOrgId, session.user.id);
  if (!role) {
    return { ok: false, status: 403, error: "organization_membership_required" };
  }

  return {
    ok: true,
    apiKey: decryptSecret(meta.mf_api_key_enc),
    actor: {
      userId: session.user.id,
      orgId: meta.mf_org_id,
      authOrgId,
      role,
    },
  };
}

export function actorHeaders(
  method: string,
  path: string,
  actor: ActorIdentity | null,
): Record<string, string> {
  if (!actor) {
    return {};
  }
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error("INTERNAL_API_SECRET not configured");
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = [
    method.toUpperCase(),
    path,
    actor.userId,
    actor.orgId,
    actor.authOrgId,
    actor.role,
    timestamp,
  ].join("\n");
  const signature = createHmac("sha256", secret).update(payload).digest("hex");

  return {
    "X-MailFlow-Actor-User-Id": actor.userId,
    "X-MailFlow-Actor-Org-Id": actor.orgId,
    "X-MailFlow-Actor-Auth-Org-Id": actor.authOrgId,
    "X-MailFlow-Actor-Role": actor.role,
    "X-MailFlow-Actor-Timestamp": timestamp,
    "X-MailFlow-Actor-Signature": signature,
  };
}
