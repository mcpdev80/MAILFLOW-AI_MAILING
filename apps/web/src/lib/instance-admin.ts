import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export type InstanceRole = "owner" | "admin";

export async function ensureInstanceAdminTable(): Promise<void> {
  await pool.query(`
    create table if not exists "mailflow_instance_admin" (
      "userId" text primary key,
      "role" text not null check ("role" in ('owner', 'admin')),
      "createdAt" timestamptz not null default now()
    )
  `);
}

export async function getInstanceRole(userId: string): Promise<InstanceRole | null> {
  await ensureInstanceAdminTable();
  const result = await pool.query<{ role: InstanceRole }>(
    'select role from "mailflow_instance_admin" where "userId" = $1 limit 1',
    [userId],
  );
  return result.rows[0]?.role ?? null;
}

export async function hasInstanceOwner(): Promise<boolean> {
  await ensureInstanceAdminTable();
  const result = await pool.query<{ exists: boolean }>(
    'select exists(select 1 from "mailflow_instance_admin" where "role" = \'owner\') as exists',
  );
  return result.rows[0]?.exists ?? false;
}

export async function claimInitialInstanceOwner(userId: string): Promise<boolean> {
  await ensureInstanceAdminTable();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("lock table \"mailflow_instance_admin\" in exclusive mode");
    const existing = await client.query(
      'select 1 from "mailflow_instance_admin" where "role" = \'owner\' limit 1',
    );
    if ((existing.rowCount ?? 0) > 0) {
      await client.query("rollback");
      return false;
    }
    await client.query(
      'insert into "mailflow_instance_admin" ("userId", "role") values ($1, \'owner\') on conflict ("userId") do nothing',
      [userId],
    );
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
