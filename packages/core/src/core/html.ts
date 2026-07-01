/**
 * Safe HTML rendering via tagged template literals.
 *
 * Auto-escapes interpolated values to prevent XSS.
 * Use `raw()` for trusted HTML that should not be escaped.
 *
 * ```ts
 * import { html, raw } from '@weifuwujs/core'
 *
 * html`<h1>${title}</h1>`               // auto-escaped
 * html`<div>${raw(trustedHtml)}</div>`   // unescaped
 * html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>`  // arrays
 * html`${isAdmin && html`<button>Admin</button>`}`        // conditionals
 * html`<div>${html`<span>nested</span>`}</div>`           // nested (safe)
 * ```
 */

interface RawHtml {
  _raw: string
}

export type HtmlValue = string | number | boolean | null | undefined | HtmlValue[] | RawHtml

const ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE[c] ?? c)
}

/**
 * Tagged template literal for safe HTML.
 *
 * Interpolated values are auto-escaped. Use {@link raw} to bypass escaping
 * for trusted HTML. Nested `html` calls are safe (not double-escaped).
 */
export function html(
  strings: TemplateStringsArray,
  ...values: HtmlValue[]
): string {
  let result = ''
  for (let i = 0; i < strings.length; i++) {
    result += strings[i]
    if (i < values.length) {
      const v = values[i]
      if (v == null || v === false) continue
      if (Array.isArray(v)) {
        result += v.join('')
      } else if (typeof v === 'object' && v !== null && '_raw' in v) {
        result += (v as RawHtml)._raw
      } else {
        result += esc(String(v))
      }
    }
  }
  return result
}

/**
 * Bypass HTML escaping for trusted content.
 *
 * Can be used standalone or inside {@link html} tagged templates.
 */
export function raw(content: string): HtmlValue {
  return { _raw: content }
}
