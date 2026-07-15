/**
 * Base — dynamic data storage engine for weifuwu.
 *
 * Each "base" is a collection of user-defined tables backed by fixed physical slots
 * (text001..064, number001..032, etc.) mapped through a column_map table.
 *
 * Requires `postgres()` and `user()` middleware registered first.
 *
 * @example
 * ```ts
 * import { serve, Router, postgres, user, base } from 'weifuwu'
 *
 * const app = new Router()
 * app.use(postgres())
 * app.use(user())
 * app.use(base())
 *
 * // Create a base with tables
 * app.post('/api/bases', async (req, ctx) => {
 *   const b = await ctx.base.create(await req.json())
 *   return Response.json(b, { status: 201 })
 * })
 *
 * // Insert data
 * app.post('/api/bases/:id/:table', async (req, ctx) => {
 *   const row = await ctx.base.insert(ctx.params.id, ctx.params.table, await req.json())
 *   return Response.json(row, { status: 201 })
 * })
 *
 * // Query with filters
 * app.get('/api/bases/:id/:table', async (req, ctx) => {
 *   const url = new URL(req.url)
 *   const filter = url.searchParams.get('filter')
 *   return Response.json(await ctx.base.query(ctx.params.id, ctx.params.table, {
 *     filter: filter ? JSON.parse(filter) : undefined,
 *     limit: parseInt(url.searchParams.get('limit') || '50'),
 *   }))
 * })
 * ```
 */

export { Base } from './module.ts'
export type {
  BaseAPI,
  BaseDef,
  BaseOptions,
  TableSchema,
  FieldSchema,
  FieldType,
  ColumnMap,
  CreateBaseInput,
  UpdateBaseInput,
  QueryOptions,
} from './types.ts'

import type { Context, Middleware } from '../types.ts'
import { Base } from './module.ts'
import type { BaseAPI, BaseOptions } from './types.ts'

/**
 * Base factory — creates the Base instance and returns a middleware
 * that injects `ctx.base`.
 *
 * Must be used **after** `postgres()` and `user()`.
 *
 * ```ts
 * app.use(postgres())
 * app.use(user())
 * app.use(base())
 * ```
 */
export function base(opts?: BaseOptions): Middleware<Context, Context & { base: BaseAPI }> {
  const module = new Base(opts)

  const mw = ((req: Request, ctx: Context, next: (r: Request, c: Context) => Response | Promise<Response>): Response | Promise<Response> => {
    return module.middleware(req, ctx, next)
  }) as unknown as Middleware<Context, Context & { base: BaseAPI }>

  mw.__meta = { injects: ['base'], depends: ['sql', 'user'] }

  return mw
}
