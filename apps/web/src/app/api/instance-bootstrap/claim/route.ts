import { auth, authEnabled } from "@/lib/auth";
import { claimInitialInstanceOwner } from "@/lib/instance-admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  if (!authEnabled || !auth) {
    return NextResponse.json({ detail: "auth_disabled" }, { status: 409 });
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ detail: "not_authenticated" }, { status: 401 });
  }

  const claimed = await claimInitialInstanceOwner(session.user.id);
  if (!claimed) {
    return NextResponse.json({ detail: "instance_owner_already_exists" }, { status: 409 });
  }

  return NextResponse.json({ role: "owner" });
}
