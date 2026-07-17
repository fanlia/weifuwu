/**
 * Org — Enterprise AI Collaboration Platform
 *
 * Manages Tenant → Company → Department → Agent hierarchy.
 *
 * Requires `postgres()`, `user()`, and `messager()` middleware registered first.
 *
 * @example
 * ```ts
 * import { serve, Router, postgres, user, messager, org } from 'weifuwu'
 *
 * const app = new Router()
 * app.use(postgres())
 * app.use(user())
 * app.use(messager())
 * app.use(org())
 *
 * // Tenants
 * app.post('/api/tenants', async (req, ctx) => {
 *   const tenant = await ctx.org.createTenant(await req.json())
 *   return Response.json(tenant, { status: 201 })
 * })
 *
 * app.get('/api/tenants', async (req, ctx) => {
 *   return Response.json(await ctx.org.listTenants())
 * })
 *
 * // Companies
 * app.post('/api/tenants/:tid/companies', async (req, ctx) => {
 *   const company = await ctx.org.createCompany(ctx.params.tid, await req.json())
 *   return Response.json(company, { status: 201 })
 * })
 *
 * // Departments (auto-creates messager conversation)
 * app.post('/api/companies/:cid/departments', async (req, ctx) => {
 *   const dept = await ctx.org.createDepartment(ctx.params.cid, await req.json())
 *   return Response.json(dept, { status: 201 })
 * })
 *
 * // Agents
 * app.post('/api/agents', async (req, ctx) => {
 *   const agent = await ctx.org.createAgent(await req.json())
 *   return Response.json(agent, { status: 201 })
 * })
 *
 * // Add agent to department (auto-joins messager conversation for user agents)
 * app.post('/api/departments/:did/agents', async (req, ctx) => {
 *   const { agentId, role } = await req.json()
 *   await ctx.org.addAgentToDepartment(ctx.params.did, agentId, role)
 *   return Response.json({ ok: true }, { status: 201 })
 * })
 * ```
 */

export { OrgModule } from './module.ts'
export type {
  OrgAPI,
  OrgOptions,
  Tenant,
  Company,
  Department,
  Agent,
  DepartmentAgent,
  AgentKind,
  CreateTenantInput,
  UpdateTenantInput,
  CreateCompanyInput,
  UpdateCompanyInput,
  CreateDepartmentInput,
  UpdateDepartmentInput,
  CreateAgentInput,
  UpdateAgentInput,
} from './types.ts'

import type { Context, Middleware } from '../types.ts'
import { OrgModule } from './module.ts'
import type { OrgAPI, OrgOptions } from './types.ts'

/**
 * Org factory — creates the OrgModule instance and returns
 * a middleware that injects `ctx.org`.
 *
 * Must be used **after** `postgres()`, `user()`, and `messager()`.
 *
 * ```ts
 * app.use(postgres())
 * app.use(user())
 * app.use(messager())
 * app.use(org())
 * ```
 */
export function org(opts?: OrgOptions): Middleware<Context, Context & { org: OrgAPI }> {
  const module = new OrgModule(opts)

  const mw = ((req: Request, ctx: Context, next: (r: Request, c: Context) => Response | Promise<Response>): Response | Promise<Response> => {
    return module.middleware(req, ctx, next)
  }) as unknown as Middleware<Context, Context & { org: OrgAPI }>

  mw.__meta = { injects: ['org'], depends: ['sql', 'user', 'messager'] }

  return mw
}
