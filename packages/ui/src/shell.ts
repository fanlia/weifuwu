/**
 * shell() — Layout middleware for page().
 *
 * Intercepts page responses and wraps content in a custom HTML shell.
 * Per-page <head> metadata via ctx.head set inside the page factory.
 *
 * ```ts
 * import { shell } from '@weifuwujs/ui'
 *
 * app.use(shell(({ head, content, bridge }) => `<!DOCTYPE html>
 * <html lang="en">
 * <head>
 *   <title>${head.title || 'App'}</title>
 *   <meta name="description" content="${head.description || ''}"/>
 *   <link rel="stylesheet" href="/_ui/weifuwu-ui.css"/>
 * </head>
 * <body>
 *   <nav><a href="/">Home</a></nav>
 *   <main>${content}</main>
 *   <script>window.__WUI_DATA=${JSON.stringify(bridge)}</script>
 *   <script defer src="/_ui/weifuwu-ui.js"></script>
 * </body>
 * </html>`))
 *
 * app.get('/', page(ctx => {
 *   ctx.head = { title: 'Home', description: 'Welcome' }
 *   return h('h1', null, 'Hello')
 * }))
 * ```
 */

import type { Middleware, Context } from '@weifuwujs/core'

export interface ShellInput {
  head: Record<string, string>
  content: string
  bridge: { signals: Record<string, unknown>; events: Array<{ key: string; type: string }> }
}

export type ShellFactory = (input: ShellInput) => string

/**
 * Create a shell (layout) middleware that wraps page content.
 * Register with app.use() before page routes.
 */
export function shell(layout: ShellFactory): Middleware {
  return async (req, ctx, next) => {
    // Signal to page() that shell middleware is active
    ctx._wuiShell = true

    const res = await next(req, ctx)

    // If page() produced body content via ctx._wuiBody, wrap it
    if (ctx._wuiBody !== undefined) {
      const head: Record<string, string> = (ctx._wuiHead as Record<string, string>) || {}
      const content = ctx._wuiBody as string
      const bridge = (ctx._wuiBridge as { signals: Record<string, unknown>; events: Array<{ key: string; type: string }> }) || {
        signals: {},
        events: [],
      }

      const html = layout({ head, content, bridge })
      return new Response(html, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }

    return res
  }
}
