/**
 * CMS — content management module for weifuwu.
 *
 * Requires `postgres()` and `user()` middleware registered first.
 *
 * @example
 * ```ts
 * import { serve, Router, postgres, user, cms, requireRole } from 'weifuwu'
 *
 * const app = new Router()
 * app.use(postgres())
 * app.use(user())
 * app.use(cms())
 *
 * // Public: list published posts
 * app.get('/api/posts', async (req, ctx) => {
 *   const posts = await ctx.cms.list({ type: 'post', status: 'published' })
 *   return Response.json(posts)
 * })
 *
 * // Public: get single post
 * app.get('/api/posts/:slug', async (req, ctx) => {
 *   const post = await ctx.cms.get(ctx.params.slug)
 *   if (!post) return new Response('Not found', { status: 404 })
 *   return Response.json(post)
 * })
 *
 * // Admin: create post
 * app.post('/api/admin/posts', requireRole('admin'), async (req, ctx) => {
 *   const post = await ctx.cms.create(await req.json())
 *   return Response.json(post, { status: 201 })
 * })
 *
 * // Admin: update post
 * app.patch('/api/admin/posts/:id', requireRole('admin'), async (req, ctx) => {
 *   const post = await ctx.cms.update(ctx.params.id, await req.json())
 *   if (!post) return new Response('Not found', { status: 404 })
 *   return Response.json(post)
 * })
 *
 * // Tags
 * app.get('/api/tags', async (req, ctx) => {
 *   return Response.json(await ctx.cms.listTags())
 * })
 *
 * serve(app)
 * ```
 */

export { CMS } from './module.ts'
export type {
  CMSAPI,
  CMSOptions,
  Content,
  ContentStatus,
  ContentType,
  Tag,
  TagWithCount,
  CreateContentInput,
  UpdateContentInput,
  ListContentOptions,
} from './types.ts'

import type { Context, Middleware } from '../types.ts'
import { CMS } from './module.ts'
import type { CMSAPI, CMSOptions } from './types.ts'

/**
 * CMS factory — creates the CMS instance and returns a middleware
 * that injects `ctx.cms`.
 *
 * Must be used **after** `postgres()` and `user()`.
 *
 * ```ts
 * app.use(postgres())
 * app.use(user())
 * app.use(cms())
 * ```
 */
export function cms(opts?: CMSOptions): Middleware<Context, Context & { cms: CMSAPI }> {
  const module = new CMS(opts)

  const mw = ((req: Request, ctx: Context, next: (r: Request, c: Context) => Response | Promise<Response>): Response | Promise<Response> => {
    return module.middleware(req, ctx, next)
  }) as unknown as Middleware<Context, Context & { cms: CMSAPI }>

  mw.__meta = { injects: ['cms'], depends: ['sql', 'user'] }

  return mw
}
