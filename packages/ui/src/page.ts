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
  [key: string]: unknown
}

export function page(
  factory: (ctx: PageContext) => VNode,
): Handler {
  return async (req, ctx) => {
    const tree = factory(ctx)
    const bodyHtml = serialize(tree)
    const dataBridge = extractDataBridge(tree)

    const pageHtml = `<!DOCTYPE html>
<html lang="en" data-theme="system">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>weifuwu</title>
  <link rel="stylesheet" href="/_ui/weifuwu-ui.css"/>
  <script id="__wui-data" type="application/json">${JSON.stringify(dataBridge)}</script>
</head>
<body>
  <div id="app">${bodyHtml}</div>
  <script defer src="/_ui/weifuwu-ui.js"></script>
</body>
</html>`

    return new Response(pageHtml, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
}

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

    // ShowNode / EachNode — walk the signal and factory result
    const nObj = n as Record<string, unknown>
    if (nObj._type === 'show') {
      const show = n as { signal: unknown; factory: () => unknown }
      walk(show.signal)
      const branch = show.factory()
      if (branch) walk(branch)
      return
    }
    if (nObj._type === 'each') {
      const eachNode = n as { signal: unknown; factory: (item: unknown, i: number) => unknown }
      walk(eachNode.signal)
      const arr = (eachNode.signal as { peek(): unknown[] }).peek()
      if (Array.isArray(arr)) {
        for (let i = 0; i < arr.length; i++) {
          const item = eachNode.factory(arr[i], i)
          if (item) walk(item)
        }
      }
      return
    }

    if ('tag' in nObj && 'attrs' in nObj) {
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
