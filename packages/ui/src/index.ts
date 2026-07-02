/**
 * @weifuwu/ui — Server assets
 *
 * Provides weifuwuiAssets() to serve the client runtime.
 *
 * Usage:
 *   import { weifuwuiAssets } from '@weifuwu/ui'
 *   app.mount('/_ui', weifuwuiAssets())
 */

import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from '@weifuwujs/core'

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
 * Serve @weifuwu/ui static assets (CSS + JS) as a sub-router.
 *
 * Routes:
 *   /weifuwu-ui.css  — CSS framework
 *   /weifuwu-ui.js   — Client runtime (ref, html, render + stores)
 *
 * Usage:
 *   import { weifuwuiAssets } from '@weifuwu/ui'
 *   app.mount('/_ui', weifuwuiAssets())
 */
export function weifuwuiAssets(): Router {
  const r = new Router()

  const serveCss = async () => {
    await _promise
    return new Response(cssContent, {
      headers: {
        'content-type': 'text/css',
        'cache-control': 'public, max-age=86400',
      },
    })
  }

  const serveJs = async () => {
    await _promise
    return new Response(jsContent, {
      headers: {
        'content-type': 'application/javascript',
        'cache-control': 'public, max-age=86400',
      },
    })
  }

  r.get('/weifuwu-ui.css', serveCss)
  r.get('/weifuwu-ui.js', serveJs)
  return r
}
