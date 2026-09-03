/**
 * Server-side API authentication for the MailFlow BFF.
 *
 * The organization API key identifies the tenant. In authenticated multi-user
 * mode we additionally propagate the Better Auth user id in signed headers so
 * FastAPI can enforce private mailbox ownership without trusting browser input.
 */
import { createHmac } from "node:crypto";
import { auth, authEnabled } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";

export const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ?? "http://localhost:8000";

interface ActorIdentity {
  userId: string;
  orgId: string;
}

export type KeyResolution =
  | { ok: true; apiKey: string | null; actor: ActorIdentity | null }
  | { ok: false; status: number; error: string };

interface OrgMeta {
  mf_api_key_enc?: string;
  mf_org_id?: string;
}

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

  const orgId = session.session.activeOrganizationId;
  const org = await auth.api.getFullOrganization({
    headers: reqHeaders,
    query: orgId ? { organizationId: orgId } : {},
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

  return {
    ok: true,
    apiKey: decryptSecret(meta.mf_api_key_enc),
    actor: {
      userId: session.user.id,
      orgId: meta.mf_org_id,
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
  const payload = [method.toUpperCase(), path, actor.userId, actor.orgId, timestamp].join(
    "\n",
  );
  const signature = createHmac("sha256", secret).update(payload).digest("hex");

  return {
    "X-MailFlow-Actor-User-Id": actor.userId,
    "X-MailFlow-Actor-Org-Id": actor.orgId,
    "X-MailFlow-Actor-Timestamp": timestamp,
    "X-MailFlow-Actor-Signature": signature,
  };
}
