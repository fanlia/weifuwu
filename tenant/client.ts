import type { Context, Handler } from '../types.ts'
import type { TenantOptions, TenantModule, TenantContext } from './types.ts'
import { PgModule } from '../postgres/module.ts'
import { migrate } from './migrate.ts'
import { buildRouter } from './rest.ts'
import { buildGraphQLHandler } from './graphql.ts'

export function tenant(options: TenantOptions): TenantModule {
  const pg = options.pg
  const sql = pg.sql
  const usersTable = options.usersTable

  const base = new PgModule(pg)

  return {
    migrate: () => migrate({ sql, usersTable }),
    middleware() {
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
    },
    router: () => buildRouter(sql, usersTable),
    graphql: () => buildGraphQLHandler(sql),
    close: () => base.close(),
  }
}
