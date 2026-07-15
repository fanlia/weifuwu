/**
 * User module — complete authentication & user management system.
 *
 * Requires `postgres()` middleware registered first (provides `ctx.sql`).
 *
 * @example
 * ```ts
 * import { serve, Router, postgres, user, requireRole } from 'weifuwu'
 *
 * const app = new Router()
 * app.use(postgres())
 * app.use(user({ secret: process.env.JWT_SECRET }))
 *
 * // Public routes
 * app.post('/api/register', async (req, ctx) => {
 *   const result = await ctx.userModule.register(await req.json())
 *   return Response.json(result)
 * })
 *
 * app.post('/api/login', async (req, ctx) => {
 *   const { email, password } = await req.json()
 *   const result = await ctx.userModule.login(email, password)
 *   if (!result) return new Response('Unauthorized', { status: 401 })
 *   return Response.json(result)
 * })
 *
 * // Protected — any authenticated user
 * app.get('/api/me', async (req, ctx) => {
 *   if (!ctx.user) return new Response('Unauthorized', { status: 401 })
 *   return Response.json(ctx.user)
 * })
 *
 * // Protected — admin only
 * app.get('/api/admin/users', requireRole('admin'), async (req, ctx) => {
 *   const users = await ctx.userModule.listUsers()
 *   return Response.json(users)
 * })
 *
 * serve(app)
 * ```
 */

export { UserModule } from './module.ts'
export { requireRole } from './types.ts'
export type {
  UserModuleAPI,
  UserModuleOptions,
  UserRecord,
  CreateUserInput,
  UpdateUserInput,
  TokenPayload,
} from './types.ts'

import type { Context, Middleware } from '../types.ts'
import { UserModule } from './module.ts'
import type { UserModuleAPI, UserModuleOptions } from './types.ts'

/**
 * User system factory — creates the UserModule instance and returns
 * a middleware that injects `ctx.userModule` (per-request bound API)
 * and resolves `ctx.user` from JWT tokens.
 *
 * Must be used **after** `postgres()` so that `ctx.sql` is available.
 *
 * ```ts
 * app.use(postgres())
 * app.use(user({ secret: process.env.JWT_SECRET }))
 * ```
 */
export function user(opts?: UserModuleOptions): Middleware<Context, Context & { userModule: UserModuleAPI }> {
  const module = new UserModule(opts)

  const mw = ((req: Request, ctx: Context, next: (r: Request, c: Context) => Response | Promise<Response>): Response | Promise<Response> => {
    return module.middleware(req, ctx, next)
  }) as unknown as Middleware<Context, Context & { userModule: UserModuleAPI }>

  mw.__meta = { injects: ['userModule', 'user'], depends: ['sql'] }

  return mw
}
