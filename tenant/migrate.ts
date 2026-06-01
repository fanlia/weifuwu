import type { Sql } from '../vendor.ts'

export interface MigrateOptions {
  sql: Sql<{}>
  usersTable: string
}

export async function migrate(opts: MigrateOptions): Promise<void> {
  const { sql, usersTable } = opts

  await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS "vector"`)

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "_tenants" (
      "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      "name" TEXT NOT NULL,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "_tenant_members" (
      "id" SERIAL PRIMARY KEY,
      "tenant_id" TEXT NOT NULL REFERENCES "_tenants"("id") ON DELETE CASCADE,
      "user_id" INTEGER NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'member',
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE("tenant_id", "user_id")
    )
  `)

  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS "_tenant_members_user_id_idx" ON "_tenant_members" ("user_id")
  `)

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "_user_tables" (
      "id" SERIAL PRIMARY KEY,
      "tenant_id" TEXT NOT NULL REFERENCES "_tenants"("id") ON DELETE CASCADE,
      "slug" TEXT NOT NULL,
      "label" TEXT NOT NULL DEFAULT '',
      "fields" JSONB NOT NULL DEFAULT '[]',
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE("tenant_id", "slug")
    )
  `)

  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS "_user_tables_tenant_id_idx" ON "_user_tables" ("tenant_id")
  `)
}
