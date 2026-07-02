/**
 * page() — Create a SSR-handler from a VNode factory.
 *
 * Returns a standard Handler compatible with Router.get().
 *
 * ```ts
 * import { page, h, ref } from '@weifuwu/ui'
 *
 * router.get('/', page((ctx) => {
 *   const count = ref(0)
 *   return h('button', { onclick: () => count.value++ }, count)
 * }))
 * ```
 */

import type { Handler } from '@weifuwujs/core'
import { serialize, type VNode } from './vnode.ts'

export interface PageContext {
  /** Injected middleware fields (theme, i18n, etc.) */
  [key: string]: unknown
}

/**
 * Layout function: wraps page content in a full HTML document.
 * Override via setDefaultLayout() or page(fn, { layout }).
 */
export type LayoutFunction = (content: string, ctx: PageContext) => string

let defaultLayout: LayoutFunction = (content, ctx) => `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${(ctx.theme as string) || 'system'}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>weifuwu</title>
  <link rel="stylesheet" href="/_ui/weifuwu-ui.css"/>
</head>
<body>
  <div id="app">${content}</div>
  <script defer src="/_ui/weifuwu-ui.js"></script>
</body>
</html>`

/**
 * Override the default layout used by all pages.
 *
 * ```ts
 * import { setDefaultLayout } from '@weifuwujs/ui'
 *
 * setDefaultLayout((content, ctx) => html\`
 *   <!DOCTYPE html>
 *   <html>
 *     <head>
 *       <title>\${ctx.title || 'App'}</title>
 *       <link rel="stylesheet" href="/_ui/weifuwu-ui.css"/>
 *     </head>
 *     <body>
 *       <nav>...global nav...</nav>
 *       <main>\${content}</main>
 *     </body>
 *   </html>
 * \`)
 * ```
 */
export function setDefaultLayout(layout: LayoutFunction): void {
  defaultLayout = layout
}

/**
 * Define a page component that supports SSR + client hydration.
 *
 * @param factory - Function that receives context and returns a VNode tree.
 * @param options - Optional layout override for this page.
 * @returns A standard Handler for use with Router.get().
 */
export function page(
  factory: (ctx: PageContext) => VNode,
  options?: { layout?: LayoutFunction },
): Handler {
  return async (req, ctx) => {
    const tree = factory(ctx)
    const bodyHtml = serialize(tree)
    const dataBridge = extractDataBridge(tree)

    const layout = options?.layout ?? defaultLayout
    const pageHtml = layout(bodyHtml, ctx)

    // Inject __wui-data bridge before </body> (or at end)
    const bridgeScript = `<script id="__wui-data" type="application/json">${JSON.stringify(dataBridge)}</script>`
    const finalHtml = pageHtml.replace('</body>', `${bridgeScript}\n</body>`)

    return new Response(finalHtml, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
}

// ── Data bridge extraction ─────────────────────────────────────

interface DataBridge {
  signals: Record<string, unknown>
  events: Array<{ key: string; type: string }>
}

let signalCounter = 0

function extractDataBridge(node: VNode | unknown): DataBridge {
  const signals: Record<string, unknown> = {}
  const events: Array<{ key: string; type: string }> = []
  signalCounter = 0

  function walk(n: unknown): void {
    if (!n || typeof n !== 'object') return

    if (typeof (n as Record<string, unknown>).peek === 'function') {
      const s = n as { peek(): unknown; value: unknown }
      const key = `s${signalCounter++}`
      signals[key] = s.peek()
      return
    }

    if ('tag' in (n as Record<string, unknown>) && 'attrs' in (n as Record<string, unknown>)) {
      const node = n as VNode
      if (node.attrs) {
        for (const [key, value] of Object.entries(node.attrs)) {
          if (key.startsWith('on') && typeof value === 'function') {
            events.push({ key, type: key.slice(2).toLowerCase() })
          }
        }
      }
      if (node.children) {
        for (const child of node.children) {
          walk(child)
        }
      }
      return
    }

    if (Array.isArray(n)) {
      for (const item of n) {
        walk(item)
      }
    }
  }

  walk(node)
  return { signals, events }
}
