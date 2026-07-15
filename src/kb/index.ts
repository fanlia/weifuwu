/**
 * KB — RAG knowledge base module.
 *
 * Splits documents into chunks, embeds via DashScope text-embedding-v4,
 * stores vectors in PostgreSQL with pgvector, and provides similarity search.
 *
 * Requires `postgres()` middleware registered first.
 *
 * @example
 * ```ts
 * import { serve, Router, postgres, kb } from 'weifuwu'
 *
 * const app = new Router()
 * app.use(postgres())
 * app.use(kb())
 *
 * // Import
 * app.post('/api/kb/import', async (req, ctx) => {
 *   const { title, content } = await req.json()
 *   const result = await ctx.kb.importText(title, content)
 *   return Response.json(result, { status: 201 })
 * })
 *
 * // Search (RAG)
 * app.post('/api/kb/search', async (req, ctx) => {
 *   const { query } = await req.json()
 *   const results = await ctx.kb.search(query, { limit: 5 })
 *   return Response.json(results)
 * })
 *
 * // Use with agent
 * app.use(agent({
 *   model: openai('deepseek-v4-flash', { baseURL: 'https://api.deepseek.com/v1' }),
 *   knowledge: {
 *     search: async (query, ctx) => ctx.kb.search(query),
 *   },
 * }))
 * ```
 */

export { KB } from './module.ts'
export type {
  KBAPI,
  KBOptions,
  Document,
  Chunk,
  SearchResult,
  ImportOptions,
  SearchOptions,
} from './types.ts'

import type { Context, Middleware } from '../types.ts'
import { KB } from './module.ts'
import type { KBAPI, KBOptions } from './types.ts'

/**
 * KB factory — creates the KB instance and returns a middleware
 * that injects `ctx.kb`.
 *
 * Must be used **after** `postgres()`.
 *
 * ```ts
 * app.use(postgres())
 * app.use(kb())
 * ```
 */
export function kb(opts?: KBOptions): Middleware<Context, Context & { kb: KBAPI }> {
  const module = new KB(opts)

  const mw = ((req: Request, ctx: Context, next: (r: Request, c: Context) => Response | Promise<Response>): Response | Promise<Response> => {
    return module.middleware(req, ctx, next)
  }) as unknown as Middleware<Context, Context & { kb: KBAPI }>

  mw.__meta = { injects: ['kb'], depends: ['sql'] }

  return mw
}
