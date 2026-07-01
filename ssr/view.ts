/**
 * view — Handler factory that renders a page template.
 *
 * Loads a `.ts` module and calls its **default export** function to
 * produce an HTML response. The function can return:
 * - A {@link RawString} (from `html()` or `raw()`)
 * - A plain `string`
 * - A `Response` (for redirects, custom status codes, etc.)
 *
 * ```ts
 * // ui/app/page.ts
 * export default function() {
 *   return html`<h1>Hello</h1>`
 * }
 *
 * // Or with ctx access:
 * export default function(ctx: Context) {
 *   return html`<h1>${ctx.params.slug}</h1>`
 * }
 *
 * // Or for custom status:
 * export default function(ctx) {
 *   if (!ctx.params.id) return new Response('Not Found', { status: 404 })
 *   return html`<h1>${ctx.params.id}</h1>`
 * }
 * ```
 *
 * @param path - Absolute or relative path to a `.ts` module.
 * @returns A {@link Handler} that renders the page.
 */
import type { Handler } from '../types.ts'
import { loadModule } from './compile.ts'
import type { RawString } from './html.ts'

export interface ViewOptions {
  /** Pre-loaded module (for production pre-build) */
  module?: unknown
}

function isRawString(v: unknown): v is RawString {
  return (
    typeof v === 'object' &&
    v !== null &&
    '__brand' in v &&
    (v as RawString).__brand === 'RawString'
  )
}

function isResponse(v: unknown): v is Response {
  return v instanceof Response
}

export function view(path: string, options?: ViewOptions): Handler {
  return async (req, ctx) => {
    let mod: unknown

    if (options?.module) {
      mod = options.module
    } else {
      mod = await loadModule(path)
    }

    const renderFn = (mod as Record<string, unknown>).default

    if (typeof renderFn !== 'function') {
      throw new Error(
        `[view] Module "${path}" must export a default function, got ${typeof renderFn}`,
      )
    }

    // Call the render function. It may or may not accept ctx.
    // Try with ctx first, fall back to no args for simpler templates.
    const result = renderFn.length >= 1 ? await renderFn(ctx) : await renderFn()

    // If the function returned a Response, use it as-is
    if (isResponse(result)) return result

    // Otherwise wrap in a text/html Response
    const body = isRawString(result) ? result.value : String(result)

    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
}
