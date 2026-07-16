/**
 * ui 中间件 — 注入 ctx.ui.html / ctx.ui.js
 *
 * ctx.ui.html 是 tagged template，返回完整 HTML Response。
 * ctx.ui.js 编译 TSX 入口，返回客户端 JS bundle。
 *
 * ```ts
 * import { ui, serve } from 'weifuwu'
 *
 * app.use(ui({ title: 'My App', script: '/static/app.js' }))
 *
 * // SSR 页面 — tagged template 直接返回 Response
 * app.get('/blog/:slug', async (req, ctx) => ctx.ui.html({ title: post.title })`
 *   <article>
 *     <h1>${post.title}</h1>
 *     <div class="body">${html.unsafe(post.body)}</div>
 *   </article>
 * `)
 *
 * // 客户端 bundle — 动态编译
 * app.get('/static/app.js', async (req, ctx) => ctx.ui.js('./src/main.tsx'))
 *
 * // SPA 页面 — 空内容
 * app.get('*', async (req, ctx) => ctx.ui.html())
 * ```
 */

import { build } from 'esbuild'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Middleware, Context } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    ui: {
      /** Tagged template — 返回完整 HTML Response */
      html: UiHtmlFn
      /** 编译 TSX 入口，返回客户端 JS bundle */
      js: (entryPath: string) => Promise<string>
    }
  }
}

/** @internal */
type UiTagged = (strings: TemplateStringsArray, ...values: unknown[]) => Response

/** ctx.ui.html 的类型（双形态：tagged template / factory） */
export interface UiHtmlFn {
  (strings: TemplateStringsArray, ...values: unknown[]): Response
  (opts: UiHtmlOptions): UiTagged
  unsafe: (s: string) => string
}

export interface UiHtmlOptions {
  title?: string
  script?: string
  props?: Record<string, unknown>
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

/** 标记一段 HTML 不转义 */
function unsafe(s: string): HtmlSafe {
  return new HtmlSafe(s)
}

// ── 页面骨架 ──────────────────────────────────────────────

const DEFAULT_TEMPLATE = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>{{title}}</title>\n</head>\n<body>\n  <div id="root">{{ssr}}</div>\n  {{props}}\n  <script src="{{script}}"></script>\n</body>\n</html>'

function renderPage(
  body: string,
  opts: UiHtmlOptions,
): Response {
  const title = opts.title ?? 'weifuwu'
  const script = opts.script ?? '/static/app.js'
  const propsTag = opts.props
    ? `<script>window.__WFUI_PROPS__=${escape(JSON.stringify(opts.props))}</script>`
    : ''

  const doc = DEFAULT_TEMPLATE
    .replace('{{title}}', escape(title))
    .replace('{{ssr}}', body)
    .replace('{{props}}', propsTag)
    .replace('{{script}}', escape(script))

  return new Response(doc, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

// ── JS 编译缓存 ───────────────────────────────────────────

const jsCache = new Map<string, { code: string }>()

// ── 中间件 ────────────────────────────────────────────────

export function ui(opts?: UiHtmlOptions): Middleware {
  const defaults = opts ?? {}

  return async (_req, ctx, next) => {
    // ctx.ui.html 双形态：tagged template / opt factory
    function htmlEntry(this: any, ...args: any[]): any {
      // ctx.ui.html`...` → 第一个参数是 TemplateStringsArray（有 raw 属性）
      if (args[0] && typeof args[0] === 'object' && 'raw' in args[0]) {
        const [strings, ...values] = args as [TemplateStringsArray, ...unknown[]]
        let body = ''
        for (let i = 0; i < strings.length; i++) {
          body += strings[i]
          if (i < values.length) body += stringify(values[i])
        }
        return renderPage(body, defaults)
      }
      // ctx.ui.html({ opts }) → 返回 tagged template
      const opts = args[0] as UiHtmlOptions | undefined
      const merged = opts ? { ...defaults, ...opts } : defaults
      return (strings: TemplateStringsArray, ...values: unknown[]) => {
        let body = ''
        for (let i = 0; i < strings.length; i++) {
          body += strings[i]
          if (i < values.length) body += stringify(values[i])
        }
        return renderPage(body, merged)
      }
    }

    ctx.ui = {
      html: Object.assign(htmlEntry, { unsafe }) as any,
      async js(entryPath: string): Promise<string> {
        const absPath = resolve(entryPath)
        const cached = jsCache.get(absPath)
        if (cached) return cached.code

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
        return code
      },
    }

    return next(_req, ctx)
  }
}
