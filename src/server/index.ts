/**
 * weifuwu/server — 服务端渲染工具
 *
 * 提供 `html` tagged template，用于安全地生成 HTML 字符串。
 * 默认自动转义，通过 `html.unsafe()` 显式标记不转义的内容。
 *
 * ```ts
 * import { html } from 'weifuwu/server'
 *
 * const title = 'Hello & World'
 * const body = '<p>Safe</p>'
 *
 * html`<h1>${title}</h1><div>${html.unsafe(body)}</div>`
 * // → <h1>Hello &amp; World</h1><div><p>Safe</p></div>
 * ```
 */

class HtmlSafe {
  constructor(public value: string) {}
  toString() { return this.value }
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Tagged template 用于安全地生成 HTML。
 *
 * - 插值中的字符串自动转义 HTML 特殊字符
 * - `html.unsafe(str)` 标记不转义的原始 HTML
 * - `null`/`undefined`/`false`/`true` 被跳过
 * - 数组自动展平（适配 `.map()` 结果）
 *
 * ```ts
 * const items = ['a', 'b']
 * html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>`
 * ```
 */
export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): HtmlSafe {
  let result = ''
  for (let i = 0; i < strings.length; i++) {
    result += strings[i]
    if (i < values.length) {
      result += stringify(values[i])
    }
  }
  return new HtmlSafe(result)
}

function stringify(v: unknown): string {
  if (v == null || v === false || v === true) return ''
  if (Array.isArray(v)) return v.map(stringify).join('')
  if (v instanceof HtmlSafe) return v.value
  return escape(String(v))
}

html.unsafe = (s: string) => new HtmlSafe(s)
