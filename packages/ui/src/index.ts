/**
 * @weifuwujs/ui — Full-stack UI framework
 *
 * Server exports:
 *   h()   — lightweight VNode factory (SSR)
 *   page() — create a SSR Handler for Router.get()
 *   ref, signal, computed, effect, batch — reactive primitives
 *   weifuwuiAssets() — serve client runtime as static files
 *
 * Usage:
 *   import { serve, Router } from '@weifuwujs/core'
 *   import { page, h, ref } from '@weifuwujs/ui'
 *
 *   const app = new Router()
 *     .get('/', page(() => {
 *       const count = ref(0)
 *       return h('button', { onclick: () => count.value++ }, count)
 *     }))
 *     .get('/api/ping', () => Response.json({ pong: true }))
 *
 *   serve(app, { port: 3000 })
 */

export { h, serialize } from './vnode.ts'
export type { VNode, VChild, VAttrs } from './vnode.ts'

export { page } from './page.ts'
export type { PageContext } from './page.ts'

// Reactive primitives (shared — work on both server and client)
export { ref, computed, effect, batch, Signal, Computed } from './signal.ts'

// Static assets for client runtime
export { weifuwuiAssets } from './assets.ts'


