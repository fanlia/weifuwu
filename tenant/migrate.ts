import type { Sql } from '../vendor.ts'
import { pgTable, serial, text, integer, timestamptz, jsonb, sql as schemaSql } from '../postgres/schema/index.ts'

export interface MigrateOptions {
  sql: Sql<{}>
  usersTable: string
}

export async function migrate(opts: MigrateOptions): Promise<void> {
  const { sql } = opts

  await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS "vector"`)

  const tenants = pgTable('_tenants', {
    id: text('id').primaryKey().default(schemaSql`gen_random_uuid()`),
    name: text('name').notNull(),
    created_at: timestamptz('created_at').notNull().default(schemaSql`NOW()`),
  })
  await tenants.create(sql)

  const members = pgTable('_tenant_members', {
    id: serial('id').primaryKey(),
    tenant_id: text('tenant_id').notNull().references('_tenants', 'id', 'cascade'),
    user_id: integer('user_id').notNull(),
    role: text('role').notNull().default('member'),
    created_at: timestamptz('created_at').notNull().default(schemaSql`NOW()`),
  })
  await members.create(sql)
  await members.createIndex(sql, 'user_id')
  await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "_tenant_members_unique_idx" ON "_tenant_members" ("tenant_id", "user_id")`)

  const tables = pgTable('_user_tables', {
    id: serial('id').primaryKey(),
    tenant_id: text('tenant_id').notNull().references('_tenants', 'id', 'cascade'),
    slug: text('slug').notNull(),
    label: text('label').notNull().default(''),
    fields: jsonb('fields').notNull().default(schemaSql`'[]'::jsonb`),
    created_at: timestamptz('created_at').notNull().default(schemaSql`NOW()`),
  })
  await tables.create(sql)
  await tables.createIndex(sql, 'tenant_id')
  await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "_user_tables_unique_idx" ON "_user_tables" ("tenant_id", "slug")`)
}
