/**
 * Messager — instant messaging module for weifuwu.
 *
 * Requires `postgres()` and `user()` middleware registered first.
 *
 * @example
 * ```ts
 * import { serve, Router, postgres, user, messager } from 'weifuwu'
 *
 * const app = new Router()
 * app.use(postgres())
 * app.use(user())
 * app.use(messager())
 *
 * // WebSocket — auto-join all conversations on connect
 * app.ws('/ws', {
 *   async open(ws, ctx) {
 *     for (const c of await ctx.messager.getConversations()) {
 *       ctx.ws.join(`conversation:${c.id}`)
 *     }
 *   },
 * })
 *
 * // REST API
 * app.post('/api/conversations', async (req, ctx) => {
 *   const { type, title, userIds } = await req.json()
 *   return type === 'direct'
 *     ? Response.json(await ctx.messager.createDirectConversation(userIds[0]))
 *     : Response.json(await ctx.messager.createGroupConversation(title, userIds))
 * })
 *
 * app.get('/api/conversations', async (req, ctx) => {
 *   return Response.json(await ctx.messager.getConversations())
 * })
 *
 * app.post('/api/conversations/:id/messages', async (req, ctx) => {
 *   const { body } = await req.json()
 *   const msg = await ctx.messager.sendMessage(ctx.params.id, body)
 *   return Response.json(msg, { status: 201 })
 * })
 *
 * app.get('/api/conversations/:id/messages', async (req, ctx) => {
 *   const url = new URL(req.url)
 *   const opts = {
 *     before: url.searchParams.get('before') || undefined,
 *     limit: parseInt(url.searchParams.get('limit') || '50'),
 *   }
 *   return Response.json(await ctx.messager.getMessages(ctx.params.id, opts))
 * })
 *
 * serve(app)
 * ```
 */

export { Messager } from './module.ts'
export type {
  MessagerAPI,
  MessagerOptions,
  Conversation,
  ConversationType,
  Participant,
  ParticipantUser,
  Message,
  MessagePreview,
  CreateGroupInput,
  GetMessagesOptions,
} from './types.ts'

import type { Context, Middleware } from '../types.ts'
import { Messager } from './module.ts'
import type { MessagerAPI, MessagerOptions } from './types.ts'

/**
 * Messager factory — creates the Messager instance and returns
 * a middleware that injects `ctx.messager`.
 *
 * Must be used **after** `postgres()` and `user()`.
 *
 * ```ts
 * app.use(postgres())
 * app.use(user())
 * app.use(messager())
 * ```
 */
export function messager(opts?: MessagerOptions): Middleware<Context, Context & { messager: MessagerAPI }> {
  const module = new Messager(opts)

  const mw = ((req: Request, ctx: Context, next: (r: Request, c: Context) => Response | Promise<Response>): Response | Promise<Response> => {
    return module.middleware(req, ctx, next)
  }) as unknown as Middleware<Context, Context & { messager: MessagerAPI }>

  mw.__meta = { injects: ['messager'], depends: ['sql', 'user'] }

  return mw
}
