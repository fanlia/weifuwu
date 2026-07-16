/**
 * ui 中间件 — 注入 ctx.ui.html / ctx.ui.js / ctx.ui.css
 *
 * ctx.ui.html  是 tagged template，返回完整 HTML Response。
 * ctx.ui.js    编译 TSX 入口，返回 JS bundle Response。
 * ctx.ui.css   读取/编译 CSS 入口，返回 CSS Response。
 *
 * ```ts
 * import { ui } from 'weifuwu'
 *
 * app.use(ui())
 *
 * app.get('/blog/:slug', async (req, ctx) => ctx.ui.html`
 *   <!DOCTYPE html>
 *   <html>
 *   <head><title>${post.title}</title></head>
 *   <body>
 *     <div id="root"><article>...</article></div>
 *     <script src="/static/app.js"></script>
 *   </body>
 *   </html>
 * `)
 *
 * app.get('/static/app.js', async (req, ctx) => ctx.ui.js('./src/main.tsx'))
 * app.get('/static/style.css', async (req, ctx) => ctx.ui.css('./public/style.css'))
 * ```
 */

import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Middleware, Context } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    ui: {
      /** Tagged template → HTML Response */
      html: UiHtmlTag
      /** 编译 TSX → JS bundle Response */
      js: (entryPath: string) => Promise<Response>
      /** 读取/编译 CSS → CSS Response */
      css: (entryPath: string) => Promise<Response>
    }
  }
}

interface UiHtmlTag {
  (strings: TemplateStringsArray, ...values: unknown[]): Response
  unsafe: (s: string) => string
}

// ── HtmlSafe — 标记不转义的 HTML ──────────────────────────

class HtmlSafe {
  constructor(public value: string) {}
  toString() { return this.value }
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function stringify(v: unknown): string {
  if (v == null || v === false || v === true) return ''
  if (Array.isArray(v)) return v.map(stringify).join('')
  if (v instanceof HtmlSafe) return v.value
  return escape(String(v))
}

function unsafe(s: string): string {
  return new HtmlSafe(s) as unknown as string
}

// ── JS 编译缓存 ───────────────────────────────────────────

const jsCache = new Map<string, { code: string }>()
const cssCache = new Map<string, { code: string; mtime: number }>()

// ── 中间件 ────────────────────────────────────────────────

export function ui(): Middleware {
  return async (_req, ctx, next) => {
    function htmlTag(strings: TemplateStringsArray, ...values: unknown[]): Response {
      let body = ''
      for (let i = 0; i < strings.length; i++) {
        body += strings[i]
        if (i < values.length) body += stringify(values[i])
      }
      return new Response(body, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    ctx.ui = {
      html: Object.assign(htmlTag, { unsafe }) as any,

      async js(entryPath: string): Promise<Response> {
        const absPath = resolve(entryPath)
        const cached = jsCache.get(absPath)
        if (cached) {
          return new Response(cached.code, {
            headers: { 'Content-Type': 'application/javascript' },
          })
        }

        const result = await build({
          entryPoints: [absPath],
          bundle: true,
          format: 'esm',
          platform: 'browser',
          jsx: 'automatic',
          jsxImportSource: 'weifuwu/client',
          write: false,
        })

        const code = result.outputFiles[0].text
        jsCache.set(absPath, { code })

        return new Response(code, {
          headers: { 'Content-Type': 'application/javascript' },
        })
      },

      async css(entryPath: string): Promise<Response> {
        const absPath = resolve(entryPath)

        // 带 mtime 的缓存失效（开发时编辑 CSS 自动更新）
        const stat = await import('node:fs').then(fs => fs.promises.stat(absPath))
        const cached = cssCache.get(absPath)
        if (cached && cached.mtime === stat.mtimeMs) {
          return new Response(cached.code, {
            headers: { 'Content-Type': 'text/css; charset=utf-8' },
          })
        }

        const code = await readFile(absPath, 'utf-8')
        cssCache.set(absPath, { code, mtime: stat.mtimeMs })

        return new Response(code, {
          headers: { 'Content-Type': 'text/css; charset=utf-8' },
        })
      },
    }

    return next(_req, ctx)
  }
}
