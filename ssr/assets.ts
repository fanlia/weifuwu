/**
 * assets — Serve HTMX and Alpine.js from local node_modules.
 *
 * Removes CDN dependency. Scripts are served at fixed URLs for caching.
 *
 * ```ts
 * import { assetRouter, assetScripts } from 'weifuwu'
 *
 * app.use('/', assetRouter())
 * // → serves /__wfw/js/htmx.min.js, /__wfw/js/alpine.min.js
 *
 * // In layout:
 * ${assetScripts()}
 * // → <script src="/__wfw/js/htmx.min.js"></script>
 * // → <script defer src="/__wfw/js/alpine.min.js"></script>
 * ```
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Router } from '../core/router.ts'
import { raw, type RawString } from './html.ts'

// Resolve htmx and alpine from project's node_modules (works in both
// development and when weifuwu is installed as a dependency)
function resolvePackage(name: string, file: string): string {
  return resolve(process.cwd(), 'node_modules', name, file)
}

const HTMX_PATH = resolvePackage('htmx.org', 'dist/htmx.min.js')
const ALPINE_PATH = resolvePackage('alpinejs', 'dist/cdn.min.js')

let htmxContent: string | null = null
let alpineContent: string | null = null

function loadAsset(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return null
  }
}

/**
 * Create a Router that serves HTMX and Alpine.js at `/__wfw/js/`.
 *
 * ```ts
 * app.use('/', assetRouter())
 * ```
 */
export function assetRouter(): Router {
  const router = new Router()

  router.get('/__wfw/js/htmx.min.js', () => {
    if (!htmxContent) htmxContent = loadAsset(HTMX_PATH)
    if (!htmxContent) return new Response('HTMX not found', { status: 404 })
    return new Response(htmxContent, {
      headers: {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    })
  })

  router.get('/__wfw/js/alpine.min.js', () => {
    if (!alpineContent) alpineContent = loadAsset(ALPINE_PATH)
    if (!alpineContent) return new Response('Alpine not found', { status: 404 })
    return new Response(alpineContent, {
      headers: {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    })
  })

  return router
}

/**
 * Generate `<script>` tags for HTMX and Alpine, pointing to local paths.
 *
 * ```ts
 * <head>
 *   ${assetScripts()}
 * </head>
 * ```
 */
export function assetScripts(): RawString {
  return raw(`
<script src="/__wfw/js/htmx.min.js"></script>
<script defer src="/__wfw/js/alpine.min.js"></script>
`)
}
