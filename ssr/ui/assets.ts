/**
 * wfuwAssets — Pattern β module that serves weifuwu-ui static files.
 *
 * Provides:
 *   /__wfw/js/weifuwu-ui.js   — frontend runtime
 *   /__wfw/css/weifuwu-ui.css — UI component styles
 *
 * Usage:
 *   ```ts
 *   import { Router } from 'weifuwu'
 *   import { wfuwAssets } from '../ssr/ui/assets.ts'
 *
 *   const app = new Router()
 *   app.use('/', wfuwAssets())
 *
 *   // In your layout:
 *   html`
 *     <script src="/__wfw/js/weifuwu-ui.js"></script>
 *     <link rel="stylesheet" href="/__wfw/css/weifuwu-ui.css">
 *   `
 *   ```
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from '../../core/router.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function wfuwAssets(): Router {
  const router = new Router()

  const jsPath = resolve(__dirname, 'weifuwu-ui.js')
  const cssPath = resolve(__dirname, 'weifuwu-ui.css')

  let jsContent: string | null = null
  let cssContent: string | null = null

  router.get('/__wfw/js/weifuwu-ui.js', () => {
    if (!jsContent) {
      try {
        jsContent = readFileSync(jsPath, 'utf-8')
      } catch {
        return new Response('weifuwu-ui.js not found', { status: 404 })
      }
    }
    return new Response(jsContent, {
      headers: {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'public, max-age=0, must-revalidate',
      },
    })
  })

  router.get('/__wfw/css/weifuwu-ui.css', () => {
    if (!cssContent) {
      try {
        cssContent = readFileSync(cssPath, 'utf-8')
      } catch {
        return new Response('weifuwu-ui.css not found', { status: 404 })
      }
    }
    return new Response(cssContent, {
      headers: {
        'content-type': 'text/css; charset=utf-8',
        'cache-control': 'public, max-age=0, must-revalidate',
      },
    })
  })

  return router
}
