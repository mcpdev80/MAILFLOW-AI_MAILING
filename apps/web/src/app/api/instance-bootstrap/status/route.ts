import { auth, authEnabled } from "@/lib/auth";
import { hasInstanceOwner } from "@/lib/instance-admin";
import { NextResponse } from "next/server";

export async function GET() {
  if (!authEnabled || !auth) {
    return NextResponse.json({
      auth_enabled: false,
      instance_owner_exists: false,
    });
  }
  return NextResponse.json({
    auth_enabled: true,
    instance_owner_exists: await hasInstanceOwner(),
  });
}
