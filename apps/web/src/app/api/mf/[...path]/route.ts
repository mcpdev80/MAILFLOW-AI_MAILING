/**
 * MailFlow BFF proxy.
 *
 * The browser calls `/api/mf/*`. This server-side handler adds the organization
 * API key and, when Better Auth is enabled, a signed user identity. Neither the
 * API key nor the signing secret is exposed to the browser.
 */
import {
  API_INTERNAL_URL,
  actorHeaders,
  resolveApiKey,
} from "@/lib/server-api";
import { type NextRequest, NextResponse } from "next/server";

const ALLOWED_PREFIXES = new Set([
  "accounts",
  "attention",
  "bootstrap",
  "llm-providers",
  "mail",
  "mail-client",
  "oauth",
  "billing",
  "health",
  "user",
]);

function isPreAuthSetupRoute(method: string, targetPath: string): boolean {
  if (method === "GET" && targetPath === "/bootstrap/status") return true;
  if (method === "GET" && targetPath === "/health") return true;
  if (method === "GET" && targetPath === "/llm-providers") return true;
  if (method === "POST" && targetPath === "/llm-providers") return true;
  if (method === "POST" && targetPath === "/llm-providers/discover-models")
    return true;
  return false;
}

function requiresOrganizationAdmin(
  method: string,
  targetPath: string,
): boolean {
  if (!targetPath.startsWith("/llm-providers")) return false;
  return !["GET", "HEAD"].includes(method.toUpperCase());
}

function buildForwardHeaders(
  request: NextRequest,
  apiKey: string | null,
  actor: Parameters<typeof actorHeaders>[2],
  targetPath: string,
): Headers {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  if (apiKey) {
    headers.set("X-API-Key", apiKey);
  }
  for (const [name, value] of Object.entries(
    actorHeaders(request.method, targetPath, actor),
  )) {
    headers.set(name, value);
  }
  return headers;
}

async function proxy(
  request: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const { path = [] } = await ctx.params;
  if (path.length === 0 || !ALLOWED_PREFIXES.has(path[0])) {
    return NextResponse.json({ detail: "not_found" }, { status: 404 });
  }

  const targetPath = `/${path.join("/")}`;
  const resolution = await resolveApiKey(request.headers, {
    allowPreAuthSetup: isPreAuthSetupRoute(request.method, targetPath),
  });
  if (!resolution.ok) {
    return NextResponse.json(
      { detail: resolution.error },
      { status: resolution.status },
    );
  }

  if (
    requiresOrganizationAdmin(request.method, targetPath) &&
    resolution.actor &&
    resolution.actor.role !== "owner" &&
    resolution.actor.role !== "admin"
  ) {
    return NextResponse.json(
      { detail: "organization_admin_required" },
      { status: 403 },
    );
  }

  const target = `${API_INTERNAL_URL}${targetPath}${request.nextUrl.search}`;
  const init: RequestInit = {
    method: request.method,
    headers: buildForwardHeaders(
      request,
      resolution.apiKey,
      resolution.actor,
      targetPath,
    ),
    cache: "no-store",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    const body = await request.arrayBuffer();
    if (body.byteLength > 0) {
      init.body = body;
    }
  }

  const res = await fetch(target, init);
  const payload = await res.arrayBuffer();
  const responseHeaders = new Headers({
    "Content-Type": res.headers.get("content-type") ?? "application/json",
    "Cache-Control": "no-store",
  });
  for (const name of ["content-disposition", "x-content-type-options"]) {
    const value = res.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(payload, {
    status: res.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
