const INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:8000";

function internalSecret(): string {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error("INTERNAL_API_SECRET not configured");
  }
  return secret;
}

async function lifecycleRequest(path: string, orgId: string, userId: string): Promise<void> {
  const response = await fetch(`${INTERNAL_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": internalSecret(),
    },
    body: JSON.stringify({ org_id: orgId, user_id: userId }),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`lifecycle_request_failed:${response.status}:${detail}`);
  }
}

export async function assertMemberRemovalSafe(orgId: string, userId: string): Promise<void> {
  await lifecycleRequest("/internal/lifecycle/member-removal-check", orgId, userId);
}

export async function finalizeMemberRemoval(orgId: string, userId: string): Promise<void> {
  await lifecycleRequest("/internal/lifecycle/member-removed", orgId, userId);
}
