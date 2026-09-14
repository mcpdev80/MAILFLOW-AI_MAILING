import { auth, authEnabled } from "@/lib/auth";
import { hasInstanceOwner } from "@/lib/instance-admin";
import { Pool } from "pg";
import { NextResponse } from "next/server";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function authSchemaReady(): Promise<boolean> {
  const result = await pool.query<{ ready: boolean }>(`
    select (
      to_regclass('public."user"') is not null
      and to_regclass('public.mailflow_instance_admin') is not null
    ) as ready
  `);
  return result.rows[0]?.ready ?? false;
}

export async function GET() {
  if (!authEnabled || !auth) {
    return NextResponse.json({
      auth_enabled: false,
      auth_schema_ready: false,
      instance_owner_exists: false,
    });
  }

  const schemaReady = await authSchemaReady();
  return NextResponse.json({
    auth_enabled: true,
    auth_schema_ready: schemaReady,
    instance_owner_exists: schemaReady ? await hasInstanceOwner() : false,
  });
}
