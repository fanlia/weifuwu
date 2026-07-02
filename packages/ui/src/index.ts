/**
 * @weifuwu/ui — Server middleware
 *
 * Provides weifuwuiAssets() to serve the client runtime.
 *
 * Usage:
 *   import { weifuwuiAssets } from '@weifuwu/ui'
 *   app.use('/_ui', weifuwuiAssets())
 */

import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')

let cssContent: string | null = null
let jsContent: string | null = null

async function loadAssets() {
  if (!cssContent) {
    try {
      cssContent = await readFile(join(distDir, 'weifuwu-ui.css'), 'utf-8')
    } catch {
      cssContent = ''
    }
  }
  if (!jsContent) {
    try {
      jsContent = await readFile(join(distDir, 'weifuwu-ui.js'), 'utf-8')
    } catch {
      jsContent = ''
    }
  }
}

const _promise = loadAssets()

/**
 * Serve @weifuwu/ui static assets (CSS + JS).
 *
 * Routes:
 *   /_ui/weifuwu-ui.css  — CSS framework
 *   /_ui/weifuwu-ui.js   — Client runtime (ref, html, render + stores)
 *
 * Usage:
 *   import { weifuwuiAssets } from '@weifuwu/ui'
 *   app.use('/_ui', weifuwuiAssets())
 */
export function weifuwuiAssets() {
  return async (_req: Request) => {
    const url = new URL(_req.url)
    const path = url.pathname

    await _promise

    if (path.endsWith('/weifuwu-ui.css') && cssContent) {
      return new Response(cssContent, {
        headers: {
          'content-type': 'text/css',
          'cache-control': 'public, max-age=86400',
        },
      })
    }

    if (path.endsWith('/weifuwu-ui.js') && jsContent) {
      return new Response(jsContent, {
        headers: {
          'content-type': 'application/javascript',
          'cache-control': 'public, max-age=86400',
        },
      })
    }

    return new Response('Not found', { status: 404 })
  }
}
