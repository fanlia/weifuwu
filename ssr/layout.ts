/**
 * layout — Middleware that wraps page HTML in a layout template.
 *
 * The layout module must export a **default function** that takes a body string
 * and returns the full HTML string. Multiple `layout()` calls nest naturally:
 *
 * ```ts
 * app.use(layout('./ui/app/layout.ts'))    // wraps: doctype + html + head + CDN
 *   // child routes...
 *   app.use(layout('./ui/blog/layout.ts')) // wraps: nav + sidebar
 *     app.get('/', view('./ui/blog/page.ts'))
 * ```
 *
 * Rendering order (inside-out):
 * ```
 * layout(根) → layout(子) → page handler → "<h1>Post</h1>"
 *   ← 子 layout 包裹 → "<nav>...</nav><h1>Post</h1>"
 *   ← 根 layout 包裹 → "<!DOCTYPE html><html>...<nav>...</nav><h1>Post</h1>..."
 * ```
 *
 * @param path - Absolute or relative path to a `.ts` layout module.
 *               The module's default export must be:
 *               `(body: string, ctx?: Context) => string | Promise<string>`
 */
import { resolve, isAbsolute } from 'node:path'
import type { Context, Middleware } from '../types.ts'

export function layout(path: string): Middleware {
  const absPath = isAbsolute(path) ? path : resolve(process.cwd(), path)
  let modPromise: Promise<unknown> | null = null

  async function getRenderFn(): Promise<(body: string, ctx: Context) => string | Promise<string>> {
    if (!modPromise) {
      modPromise = import(absPath).catch((err: unknown) => {
        modPromise = null // reset so next attempt retries
        throw new Error(
          `[layout] Failed to load layout module "${path}": ${err instanceof Error ? err.message : String(err)}`,
        )
      })
    }
    const mod = await modPromise
    const renderFn = (mod as Record<string, unknown>).default
    if (typeof renderFn !== 'function') {
      throw new Error(
        `[layout] Layout module "${path}" must export a default function, got ${typeof renderFn}`,
      )
    }
    return renderFn as (body: string, ctx: Context) => string | Promise<string>
  }

  const mw: Middleware = async (req, ctx, next) => {
    const renderFn = await getRenderFn()

    // Run inner handlers first
    const response = await next(req, ctx)

    // Only wrap HTML responses
    const ct = response.headers.get('content-type') ?? ''
    if (!ct.includes('text/html')) return response

    const body = await response.text()
    const wrapped = await renderFn(body, ctx)

    return new Response(wrapped, {
      status: response.status,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  mw.__meta = { injects: [], depends: [] }

  return mw
}
