/**
 * ui 中间件 — 注入 ctx.ui.html / ctx.ui.js / ctx.ui.css
 *
 * ctx.ui.html  是 tagged template，返回完整 HTML Response。
 * ctx.ui.js    编译 TSX 入口，返回 JS bundle Response。
 * ctx.ui.css   读取 CSS 文件（如安装 postcss + @tailwindcss/postcss 则自动编译），返回 CSS Response。
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
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Middleware, Context } from '../types.ts'
import { HtmlSafe } from './html-safe.ts'
import { v2ToHtml } from '../../client/vdom/core/v2/integrate.ts' // v1 退役——运行路径 v2 化（v1 renderToStream 仅对账基线）
import { commandToHtml } from '../../client/vdom/core/ssr/html.ts'
import { h } from '../../client/vdom/index.ts'
import type { Component } from '../../client/vdom/index.ts'

// 浏览器端编译：**零 alias（2027-03 定稿）**——import 'weifuwu/vdom' 走
// package.json exports（self-reference——dist 镜像 src 结构：dist/server/ +
// dist/client/vdom/ + dist/client/components/——exports 与 dist 一致）——
// src 模式（dev）由 tsconfig paths 映射；dist 模式（发布）由 exports 解析——
// 双面同一结构（src/server ↔ dist/server、src/client/vdom ↔ dist/client/vdom）——
// 无手写 alias（历史层级错位类 bug 根治：JS_ALIASES 删除）

declare module '../../server/types.ts' {
  interface Context {
    ui: {
      /** Tagged template → HTML Response */
      html: UiHtmlTag
      /** 编译 TSX → JS bundle Response（支持包名 weifuwu/ui-dom 或文件路径） */
      js: (entryPath: string) => Promise<Response>
      /** 读取 CSS → CSS Response（支持包名 weifuwu/layout、weifuwu/components/style.css 或文件路径） */
      css: (entryPath: string) => Promise<Response>
      /**
       * SSR 渲染组件 → HTML 片段（HtmlSafe，可直接内联进 ctx.ui.html 模板）
       * 支持 async 工厂组件：await 工厂 → 数据进 HTML。
       * opts.data（Map）收集 ctx.data 预取结果，用 ctx.ui.ssrData(data) 序列化进 __DATA__。
       */
      ssr: (Comp: Component, props?: Record<string, any>, opts?: { data?: Map<string, unknown> }) => Promise<string>
      /** 序列化 SSR 数据存储 → <script>window.__DATA__=...</script>（HtmlSafe） */
      ssrData: (data: Map<string, unknown>) => string
    }
  }
}

interface UiHtmlTag {
  (strings: TemplateStringsArray, ...values: unknown[]): Response
  unsafe: (s: string) => string
}

// ── HtmlSafe — 标记不转义的 HTML ──────────────────────────

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

const cssCache = new Map<string, { code: string; mtime: number }>()
/** 检测 postcss + tailwindcss 是否可用（只检测一次） */let postcssAvailable: boolean | undefined
async function checkPostcss(): Promise<boolean> {
  if (postcssAvailable !== undefined) return postcssAvailable
  try {
    await import('postcss')
    await import('@tailwindcss/postcss')
    postcssAvailable = true
  } catch {
    postcssAvailable = false
  }
  return postcssAvailable
}

/** 解析入口路径：包名（weifuwu/layout）→ imports map，相对/绝对路径 → path.resolve */
function resolveEntry(entryPath: string): string {
  // 相对/绝对路径：相对于 CWD 解析（不走 import.meta.resolve，避免相对框架文件位置）
  if (entryPath.startsWith('.') || entryPath.startsWith('/')) {
    return resolve(entryPath)
  }
  // 包名：通过 import.meta.resolve 解析 exports map
  try {
    return fileURLToPath(import.meta.resolve(entryPath))
  } catch {
    return resolve(entryPath)
  }
}


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

      /** SSR 渲染组件 → HTML 片段（vdom 管线：v2 引擎 → commandToHtml 流式）
       *  （2027-08——v1 退役——运行路径 v2 化——renderV2 命令同构——消费端不变） */
      async ssr(Comp: Component, props?: Record<string, any>): Promise<string> {
        return v2ToHtml(h(Comp as never, props ?? {}))
      },

      /** 序列化 SSR 数据存储 → window.__DATA__ 脚本（HtmlSafe——< 转义防注入） */
      ssrData(data: Map<string, unknown>): string {
        const json = JSON.stringify(Object.fromEntries(data)).replace(/</g, '\u003c')
        return new HtmlSafe(`<script>window.__DATA__=${json};</script>`) as unknown as string
      },

      async js(entryPath: string): Promise<Response> {
        const absPath = resolveEntry(entryPath)
        // 无缓存（2026-12 决策）：每次请求编译最新源码——永远新鲜——
        // 无 mtime 失效边界（同 ms 写文件）/无并发双编译（无锁缓存竞态）——
        // 正确性优先——编译代价可控（esbuild 单入口秒级）
        const result = await build({
          entryPoints: [absPath],
          bundle: true,
          format: 'esm',
          platform: 'browser',
          jsx: 'automatic',
          jsxImportSource: 'weifuwu/vdom',
          write: false,
        })

        const code = result.outputFiles[0].text

        return new Response(code, {
          headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' },
        })
      },

      async css(entryPath: string): Promise<Response> {
        const absPath = resolveEntry(entryPath)

        // 无缓存（2026-12 决策——与 js 一致）：每次请求读取最新文件
        let code = await readFile(absPath, 'utf-8')

        // 如果安装了 postcss + @tailwindcss/postcss，自动编译 Tailwind CSS
        if (await checkPostcss()) {
          try {
            const postcss: any = await import('postcss')
            const tw: any = await import('@tailwindcss/postcss')
            const plugin = tw.default || tw
            const instance = typeof plugin === 'function' ? plugin() : plugin
            const result = await postcss.default([instance]).process(code, { from: absPath })
            code = result.css
          } catch (e: any) {
            throw new Error(`PostCSS 编译失败 (${absPath}): ${e.message}`, { cause: e })
          }
        }

        return new Response(code, {
          headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' },
        })
      },
    }

    return next(_req, ctx)
  }
}
