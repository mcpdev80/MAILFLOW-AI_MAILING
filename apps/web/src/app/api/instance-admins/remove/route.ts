import { auth, authEnabled } from "@/lib/auth";
import { getInstanceRole, revokeInstanceAdmin } from "@/lib/instance-admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  if (!authEnabled || !auth) {
    return NextResponse.json({ detail: "auth_disabled" }, { status: 409 });
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ detail: "not_authenticated" }, { status: 401 });
  }
  const callerRole = await getInstanceRole(session.user.id);
  if (callerRole !== "owner") {
    return NextResponse.json({ detail: "instance_owner_required" }, { status: 403 });
  }

  const payload = (await request.json()) as { user_id?: unknown };
  if (typeof payload.user_id !== "string" || !payload.user_id.trim()) {
    return NextResponse.json({ detail: "user_id_required" }, { status: 422 });
  }

  await revokeInstanceAdmin(payload.user_id.trim());
  return new Response(null, { status: 204 });
}
