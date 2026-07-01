/**
 * html — Tagged template literal for safe HTML rendering.
 *
 * Auto-escapes all interpolated values. Use {@link raw} to bypass escaping.
 *
 * ```ts
 * import { html, raw } from 'weifuwu'
 *
 * const name = '<script>alert("xss")</script>'
 * html`<h1>${name}</h1>`
 * // → "<h1>&lt;script&gt;alert("xss")&lt;/script&gt;</h1>"
 *
 * html`<div>${raw('<b>safe</b>')}</div>`
 * // → "<div><b>safe</b></div>"
 * ```
 */

// ── Types ──────────────────────────────────────────────────────────────

/**
 * Opaque marker returned by {@link raw} and {@link html}.
 *
 * Carries pre-escaped HTML that won't be double-escaped when nested
 * in another {@link html} template. Has a {@link toString} for use
 * in regular string contexts.
 */
export interface RawString {
  __brand: 'RawString'
  value: string
  toString(): string
}

// ── Escaping ──────────────────────────────────────────────────────────

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(s: unknown): string {
  const str = String(s)
  // Fast path: no special chars
  if (!/[&<>"']/.test(str)) return str
  return str.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c] || c)
}

// ── Raw ───────────────────────────────────────────────────────────────

/**
 * Mark a string as pre-escaped HTML. The value will NOT be escaped
 * when interpolated into an {@link html} template.
 *
 * ```ts
 * html`<div>${raw(safeContent)}</div>`
 * ```
 */
export function raw(s: string): RawString {
  return {
    __brand: 'RawString',
    value: s,
    toString() {
      return this.value
    },
  }
}

function isRaw(v: unknown): v is RawString {
  return (
    typeof v === 'object' &&
    v !== null &&
    '__brand' in v &&
    (v as RawString).__brand === 'RawString'
  )
}

// ── Core html tag function ───────────────────────────────────────────

/**
 * Render a safe HTML string from a tagged template literal.
 *
 * - String values are HTML-escaped
 * - {@link raw} values are inserted unescaped
 * - Arrays are joined (supports `Array.map(() => html\`...\`)`)
 * - `null` and `false` render as empty string
 * - Numbers render as-is (they cannot contain HTML special chars)
 *
 * ```ts
 * html`<h1>${title}</h1>`
 * html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>`
 * html`${isAdmin && html`<button>Admin</button>`}`
 * ```
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): RawString {
  let result = ''
  for (let i = 0; i < strings.length; i++) {
    result += strings[i]
    if (i < values.length) {
      result += stringify(values[i])
    }
  }
  return raw(result)
}

function stringify(v: unknown): string {
  // null / undefined / false → empty
  if (v === null || v === undefined || v === false) return ''

  // RawString → bypass escaping
  if (isRaw(v)) return v.value

  // Array → join (support Array.map(() => html`...`))
  if (Array.isArray(v)) {
    let out = ''
    for (let i = 0; i < v.length; i++) {
      out += stringify(v[i])
    }
    return out
  }

  // Number → fast path (safe from XSS)
  if (typeof v === 'number') return String(v)

  // String (or anything else) → escape
  return escapeHtml(v)
}
