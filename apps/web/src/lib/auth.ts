/**
 * Better Auth server configuration for MailFlow's authenticated multi-user mode.
 *
 * Authentication stays in Better Auth. Mailbox ownership and authorization stay
 * in the API; passkeys and membership hooks must not create a second permission
 * system.
 */
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { Pool } from "pg";
import { encryptSecret } from "./crypto";
import { assertMemberRemovalSafe, finalizeMemberRemoval } from "./lifecycle";
import { provisionOrg } from "./provision";

export const authEnabled = process.env.WEB_AUTH === "on";

const RECENT_AUTH_MAX_AGE_MS = 10 * 60 * 1000;
const SENSITIVE_ORG_PATHS = new Set([
  "/organization/invite-member",
  "/organization/remove-member",
  "/organization/update-member-role",
  "/organization/delete",
]);
const authDb = new Pool({ connectionString: process.env.DATABASE_URL });

function resolvePasskeyConfig() {
  const baseUrl = new URL(
    process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  );
  const configuredOrigin = process.env.PASSKEY_ORIGIN
    ? new URL(process.env.PASSKEY_ORIGIN)
    : baseUrl;
  const origin = configuredOrigin.origin;
  const rpID = process.env.PASSKEY_RP_ID?.trim() || configuredOrigin.hostname;
  const rpName = process.env.PASSKEY_RP_NAME?.trim() || "MailFlow";

  if (
    process.env.NODE_ENV === "production" &&
    configuredOrigin.protocol !== "https:" &&
    configuredOrigin.hostname !== "localhost"
  ) {
    throw new Error("Passkeys require HTTPS outside localhost");
  }

  const originHost = configuredOrigin.hostname;
  if (originHost !== rpID && !originHost.endsWith(`.${rpID}`)) {
    throw new Error("PASSKEY_RP_ID must match the passkey origin hostname or its parent domain");
  }

  return { origin, rpID, rpName };
}

function mailflowOrgId(metadata: unknown): string {
  const value =
    typeof metadata === "string"
      ? (JSON.parse(metadata) as Record<string, unknown>)
      : (metadata as Record<string, unknown> | null | undefined);
  const orgId = value?.mf_org_id;
  if (typeof orgId !== "string" || !orgId) {
    throw new APIError("CONFLICT", { message: "MailFlow organization linkage missing" });
  }
  return orgId;
}

async function requireRecentSession(ctx: Parameters<typeof getSessionFromCtx>[0]) {
  const session = await getSessionFromCtx(ctx);
  if (!session) {
    throw new APIError("UNAUTHORIZED", { message: "Authentication required" });
  }

  const createdAt = new Date(session.session.createdAt).getTime();
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > RECENT_AUTH_MAX_AGE_MS) {
    throw new APIError("FORBIDDEN", {
      message: "Recent authentication required",
    });
  }
}

async function recordSecurityEvent(userId: string, event: "passkey_added" | "passkey_removed") {
  try {
    await authDb.query(
      `insert into "auth_security_event" ("id", "userId", "event") values (gen_random_uuid()::text, $1, $2)`,
      [userId, event],
    );
  } catch {
    // Authentication already succeeded at this point. Keep the user operation
    // successful, but leave a generic operational signal without credential data.
    console.error("Failed to record authentication security event");
  }
}

function buildAuth() {
  const passkeyConfig = resolvePasskeyConfig();
  const production = process.env.NODE_ENV === "production";

  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    database: authDb,
    emailAndPassword: { enabled: true },
    advanced: {
      useSecureCookies: production,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: production,
        sameSite: "lax",
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const passkeyMethodChange =
          ctx.path === "/passkey/generate-register-options" ||
          ctx.path === "/passkey/verify-registration" ||
          ctx.path === "/passkey/delete-passkey";
        if (passkeyMethodChange || SENSITIVE_ORG_PATHS.has(ctx.path)) {
          await requireRecentSession(ctx);
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (
          ctx.path !== "/passkey/verify-registration" &&
          ctx.path !== "/passkey/delete-passkey"
        ) {
          return;
        }
        const session = await getSessionFromCtx(ctx);
        if (!session) {
          return;
        }
        await recordSecurityEvent(
          session.user.id,
          ctx.path === "/passkey/verify-registration"
            ? "passkey_added"
            : "passkey_removed",
        );
      }),
    },
    plugins: [
      organization({
        organizationHooks: {
          beforeCreateOrganization: async ({ organization: org }) => {
            const provisioned = await provisionOrg({
              name: org.name ?? "Organization",
              slug: org.slug,
            });
            return {
              data: {
                ...org,
                metadata: {
                  ...(org.metadata ?? {}),
                  mf_org_id: provisioned.org_id,
                  mf_api_key_enc: encryptSecret(provisioned.api_key),
                },
              },
            };
          },
          beforeRemoveMember: async ({ member, organization: org }) => {
            try {
              await assertMemberRemovalSafe(mailflowOrgId(org.metadata), member.userId);
            } catch (error) {
              throw new APIError("CONFLICT", {
                message:
                  error instanceof Error && error.message.includes("private_mailboxes_require_resolution")
                    ? "Resolve private mailboxes before removing this member"
                    : "Mailbox lifecycle check failed",
              });
            }
          },
          afterRemoveMember: async ({ member, organization: org }) => {
            const mfOrgId = mailflowOrgId(org.metadata);
            await authDb.query(
              `delete from "session" where "userId" = $1 and "activeOrganizationId" = $2`,
              [member.userId, org.id],
            );
            await finalizeMemberRemoval(mfOrgId, member.userId);
          },
        },
      }),
      passkey({
        rpID: passkeyConfig.rpID,
        rpName: passkeyConfig.rpName,
        origin: passkeyConfig.origin,
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "required",
        },
        registration: {
          afterVerification: ({ verification }) => {
            if (!verification.registrationInfo?.userVerified) {
              throw new APIError("UNAUTHORIZED", {
                message: "Passkey user verification required",
              });
            }
          },
        },
        authentication: {
          afterVerification: ({ verification }) => {
            if (!verification.authenticationInfo.userVerified) {
              throw new APIError("UNAUTHORIZED", {
                message: "Passkey user verification required",
              });
            }
          },
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof buildAuth>;

// Do not construct auth dependencies in self-host single-tenant mode.
export const auth: Auth | null = authEnabled ? buildAuth() : null;
