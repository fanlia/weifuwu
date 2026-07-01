/**
 * wfuwAssets — Serves weifuwu frontend assets (HTMX, Alpine.js, weifuwu-ui).
 *
 * Endpoints:
 *   /__wfw/js/htmx.min.js      — HTMX (AJAX, SSE, WebSocket, forms)
 *   /__wfw/js/alpine.min.js    — Alpine.js (state, DOM binding, UI)
 *   /__wfw/js/weifuwu-ui.js    — weifuwu-ui (theme/i18n/flash Alpine stores)
 *   /__wfw/css/weifuwu-ui.css  — UI component styles
 *
 * Usage:
 *   ```ts
 *   import { wfuwAssets } from 'weifuwu'
 *   app.use('/', wfuwAssets())
 *
 *   // In layout:
 *   import { wfuwVersion } from 'weifuwu'
 *   html`
 *     <script src="/__wfw/js/htmx.min.js?v=${wfuwVersion}"></script>
 *     <script defer src="/__wfw/js/alpine.min.js?v=${wfuwVersion}"></script>
 *     <script src="/__wfw/js/weifuwu-ui.js?v=${wfuwVersion}"></script>
 *     <link rel="stylesheet" href="/__wfw/css/weifuwu-ui.css?v=${wfuwVersion}">
 *   `
 *   ```
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from '../../core/router.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Current weifuwu version. */
export const wfuwVersion: string = (() => {
  try {
    const js = readFileSync(resolve(__dirname, 'weifuwu-ui.js'), 'utf-8')
    const m = js.match(/WFU_VERSION = '([^']+)'/)
    return m ? m[1] : '0.0.0'
  } catch {
    return '0.0.0'
  }
})()

function serveFile(path: string, mime: string) {
  let content: string | null = null
  return () => {
    if (!content) {
      try {
        content = readFileSync(path, 'utf-8')
      } catch {
        return new Response('File not found', { status: 404 })
      }
    }
    return new Response(content, {
      headers: {
        'content-type': mime,
        'cache-control': 'public, max-age=31536000, immutable',
      },
    })
  }
}

export function wfuwAssets(): Router {
  const router = new Router()

  router.get('/__wfw/js/htmx.min.js', serveFile(resolve(__dirname, 'htmx.min.js'), 'application/javascript; charset=utf-8'))
  router.get('/__wfw/js/alpine.min.js', serveFile(resolve(__dirname, 'alpine.min.js'), 'application/javascript; charset=utf-8'))
  router.get('/__wfw/js/weifuwu-ui.js', serveFile(resolve(__dirname, 'weifuwu-ui.js'), 'application/javascript; charset=utf-8'))
  router.get('/__wfw/css/weifuwu-ui.css', serveFile(resolve(__dirname, 'weifuwu-ui.css'), 'text/css; charset=utf-8'))

  return router
}
