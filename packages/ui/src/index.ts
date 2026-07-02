/**
 * @weifuwujs/ui — Full-stack UI framework
 *
 * One import for the entire full-stack experience:
 *
 * ```ts
 * import { serve, Router, page, h, ref } from '@weifuwujs/ui'
 *
 * const app = new Router()
 *   .get('/', page(() => {
 *     const count = ref(0)
 *     return h('button', { onclick: () => count.value++ }, count)
 *   }))
 *   .get('/api/ping', () => Response.json({ pong: true }))
 *
 * serve(app, { port: 3000 })
 * ```
 *
 * API-only projects can import from @weifuwujs/core instead.
 */

// ── Core re-exports (full-stack convenience) ──
export { serve, Router } from '@weifuwujs/core'
export type { Handler, Context, Middleware } from '@weifuwujs/core'

// ── Server-side rendering ──
export { h, serialize } from './vnode.ts'
export type { VNode, VChild, VAttrs } from './vnode.ts'

export { page, setDefaultLayout } from './page.ts'
export type { PageContext, LayoutFunction } from './page.ts'

// ── Reactive primitives (shared — server + client) ──
export { ref, computed, effect, batch, Signal, Computed } from './signal.ts'

// ── Static assets ──
export { weifuwuiAssets } from './assets.ts'
