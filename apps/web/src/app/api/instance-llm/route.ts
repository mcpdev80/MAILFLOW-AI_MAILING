import { auth, authEnabled } from "@/lib/auth";
import { getInstanceRole } from "@/lib/instance-admin";
import { API_INTERNAL_URL } from "@/lib/server-api";
import { type NextRequest, NextResponse } from "next/server";

async function requireInstanceAdmin(request: NextRequest) {
  if (!authEnabled || !auth) return null;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const role = await getInstanceRole(session.user.id);
  return role ? { session, role } : null;
}

async function forward(
  request: NextRequest,
  method: string,
  targetPath: string,
  body?: unknown,
): Promise<Response> {
  const caller = await requireInstanceAdmin(request);
  if (!caller) {
    return NextResponse.json(
      { detail: "instance_admin_required" },
      { status: 403 },
    );
  }
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    return NextResponse.json(
      { detail: "internal_api_secret_not_configured" },
      { status: 500 },
    );
  }
  const response = await fetch(`${API_INTERNAL_URL}${targetPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-MailFlow-Internal-Secret": secret,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.arrayBuffer();
  return new Response(payload, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  return forward(request, "GET", "/internal/instance-llm");
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as Record<string, unknown>;
  const action = typeof payload.action === "string" ? payload.action : "";
  if (action === "create_provider") {
    const { action: _action, ...provider } = payload;
    return forward(request, "POST", "/internal/instance-llm/providers", provider);
  }
  if (action === "discover") {
    const providerId = String(payload.provider_id ?? "");
    return forward(
      request,
      "POST",
      `/internal/instance-llm/providers/${encodeURIComponent(providerId)}/discover`,
    );
  }
  return NextResponse.json({ detail: "invalid_action" }, { status: 422 });
}

export async function PATCH(request: NextRequest) {
  const payload = (await request.json()) as Record<string, unknown>;
  const action = typeof payload.action === "string" ? payload.action : "";
  const id = String(payload.id ?? "");
  const { action: _action, id: _id, ...body } = payload;
  if (action === "provider") {
    return forward(
      request,
      "PATCH",
      `/internal/instance-llm/providers/${encodeURIComponent(id)}`,
      body,
    );
  }
  if (action === "model") {
    return forward(
      request,
      "PATCH",
      `/internal/instance-llm/models/${encodeURIComponent(id)}`,
      body,
    );
  }
  return NextResponse.json({ detail: "invalid_action" }, { status: 422 });
}

export async function PUT(request: NextRequest) {
  const payload = (await request.json()) as Record<string, unknown>;
  const modelId = String(payload.model_id ?? "");
  const organizationIds = Array.isArray(payload.organization_ids)
    ? payload.organization_ids
    : [];
  return forward(
    request,
    "PUT",
    `/internal/instance-llm/models/${encodeURIComponent(modelId)}/grants`,
    { organization_ids: organizationIds },
  );
}

export async function DELETE(request: NextRequest) {
  const providerId = request.nextUrl.searchParams.get("provider_id") ?? "";
  if (!providerId) {
    return NextResponse.json({ detail: "provider_id_required" }, { status: 422 });
  }
  return forward(
    request,
    "DELETE",
    `/internal/instance-llm/providers/${encodeURIComponent(providerId)}`,
  );
}
