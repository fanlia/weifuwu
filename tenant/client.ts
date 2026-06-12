import type { Context, Handler } from '../types.ts'
import type { TenantOptions, TenantModule, TenantContext } from './types.ts'
import { PgModule } from '../postgres/module.ts'
import { serial, text, integer, timestamptz, jsonb, sql as schemaSql } from '../postgres/schema/index.ts'
import { buildRouter } from './rest.ts'
import { buildGraphQLHandler } from './graphql.ts'

export function tenant(options: TenantOptions): TenantModule {
  const pg = options.pg
  const sql = pg.sql
  const usersTable = options.usersTable

  const base = new PgModule(pg)

  async function migrate(): Promise<void> {
    await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS "vector"`)

    const tenants = pg.table('_tenants', {
      id: text('id').primaryKey().default(schemaSql`gen_random_uuid()`),
      name: text('name').notNull(),
      created_at: timestamptz('created_at').notNull().default(schemaSql`NOW()`),
    })
    await tenants.create()

    const members = pg.table('_tenant_members', {
      id: serial('id').primaryKey(),
      tenant_id: text('tenant_id').notNull().references('_tenants', 'id', 'cascade'),
      user_id: integer('user_id').notNull(),
      role: text('role').notNull().default('member'),
      created_at: timestamptz('created_at').notNull().default(schemaSql`NOW()`),
    })
    await members.create()
    await members.createIndex('user_id')
    await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "_tenant_members_unique_idx" ON "_tenant_members" ("tenant_id", "user_id")`)

    const tables = pg.table('_user_tables', {
      id: serial('id').primaryKey(),
      tenant_id: text('tenant_id').notNull().references('_tenants', 'id', 'cascade'),
      slug: text('slug').notNull(),
      label: text('label').notNull().default(''),
      fields: jsonb('fields').notNull().default(schemaSql`'[]'::jsonb`),
      created_at: timestamptz('created_at').notNull().default(schemaSql`NOW()`),
    })
    await tables.create()
    await tables.createIndex('tenant_id')
    await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "_user_tables_unique_idx" ON "_user_tables" ("tenant_id", "slug")`)
  }

  function middleware(): (req: Request, ctx: Context, next: Handler) => Promise<Response> {
    return async (req: Request, ctx: Context, next: Handler): Promise<Response> => {
      const user = (ctx as any).user as { id: number } | undefined
      if (!user) {
        return new Response('Unauthorized', { status: 401 })
      }

      const members = await sql`
        SELECT tm.role, t.id, t.name
        FROM "_tenant_members" tm
        JOIN "_tenants" t ON t.id = tm.tenant_id
        WHERE tm.user_id = ${user.id}
      ` as any[]

      if (members.length === 0) {
        return new Response('No tenant found. Create one via POST /sys/tenants.', { status: 403 })
      }

      if (members.length === 1) {
        const m = members[0]
        ctx.tenant = { id: m.id, name: m.name, role: m.role } as TenantContext
        return next(req, ctx)
      }

      const headerId = req.headers.get('X-Tenant-ID')
      if (!headerId) {
        return Response.json({
          error: 'Multiple tenants. Set X-Tenant-ID header.',
          tenants: members.map((m: any) => ({ id: m.id, name: m.name, role: m.role })),
        }, { status: 300 })
      }

      const member = members.find((m: any) => m.id === headerId)
      if (!member) {
        return new Response('Tenant not found', { status: 403 })
      }

      ctx.tenant = { id: member.id, name: member.name, role: member.role } as TenantContext
      return next(req, ctx)
    }
  }

  const r = buildRouter(sql, usersTable)
  const mod = r as TenantModule
  mod.migrate = migrate
  mod.middleware = middleware
  mod.graphql = () => buildGraphQLHandler(sql)
  mod.close = () => base.close()
  return mod
}
