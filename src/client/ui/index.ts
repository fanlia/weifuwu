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
import { readFile, stat } from 'node:fs/promises'
import { resolve, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Middleware, Context } from '../../server/types.ts'
import { HtmlSafe } from './html-safe.ts'
import { renderToEvents, eventsToHtml } from '../ui-dom/vdom3/ssr.ts'
import { h } from '../ui-dom/vdom3/jsx.ts'
import type { Component } from '../ui-dom/vnode.ts'

// 浏览器端编译 alias：weifuwu/* → 同构源码/产物（与 weifuwu/dev 的 BARE_ALIASES 一致——
// 全单图防 dist/src 双实例（AGENTS.md §6.1）；显式 alias 绕开 esbuild self-reference
// 解析断裂（dist/components 内部 import 'weifuwu/ui-dom' 曾解析到 src 而失败）
// src 模式：指向 src 下的 .ts；dist 模式：指向 dist 下的 .js（同一目录结构）
const HERE = dirname(fileURLToPath(import.meta.url))
const IS_SRC = fileURLToPath(import.meta.url).includes(`${sep}src${sep}`)
const JS_ALIASES: Record<string, string> = IS_SRC
  ? {
      'weifuwu/ui-dom/jsx-runtime': HERE + '/../ui-dom/jsx-runtime.ts',
      'weifuwu/ui-dom/testing': HERE + '/../ui-dom/testing.ts',
      'weifuwu/ui-dom': HERE + '/../ui-dom/index.ts',
      'weifuwu/components': HERE + '/../components/index.ts',
      'weifuwu': HERE + '/../index.ts',
    }
  : {
      'weifuwu/ui-dom/jsx-runtime': HERE + '/ui-dom/jsx-runtime.js',
      'weifuwu/ui-dom/testing': HERE + '/ui-dom/testing.js',
      'weifuwu/ui-dom': HERE + '/ui-dom/index.js',
      'weifuwu/components': HERE + '/components/index.js',
      'weifuwu': HERE + '/index.js',
    }

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

const jsCache = new Map<string, { code: string; inputs: Record<string, number> }>()

/** 检查缓存的所有输入文件 mtime — 任一变化则失效（开发模式改 TSX 免重启） */
async function jsCacheFresh(inputs: Record<string, number>): Promise<boolean> {
  for (const [file, mtime] of Object.entries(inputs)) {
    try {
      const st = await stat(file)
      if (st.mtimeMs !== mtime) {
        console.log(`[ui:js-cache] 失效: ${file} (cached=${mtime} now=${st.mtimeMs})`)
        return false
      }
    } catch {
      console.log(`[ui:js-cache] 失效: stat 失败 ${file}`)
      return false
    }
  }
  console.log(`[ui:js-cache] 命中: ${Object.keys(inputs).length} inputs`)
  return true
}
const cssCache = new Map<string, { code: string; mtime: number }>()

/** 检测 postcss + tailwindcss 是否可用（只检测一次） */
let postcssAvailable: boolean | undefined
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

      /** SSR 渲染组件 → HTML 片段（vdom3 事件流形态：组件构建 → 事件流 → HTML 序列化） */
      async ssr(Comp: Component, props?: Record<string, any>): Promise<string> {
        const events = await renderToEvents(h(Comp as never, props ?? {}))
        return new HtmlSafe(eventsToHtml(events)) as unknown as string
      },

      /** 序列化 SSR 数据存储 → window.__DATA__ 脚本（HtmlSafe——< 转义防注入） */
      ssrData(data: Map<string, unknown>): string {
        const json = JSON.stringify(Object.fromEntries(data)).replace(/</g, '\u003c')
        return new HtmlSafe(`<script>window.__DATA__=${json};</script>`) as unknown as string
      },

      async js(entryPath: string): Promise<Response> {
        const absPath = resolveEntry(entryPath)
        const cached = jsCache.get(absPath)
        console.log(`[ui:js-cache] 请求: ${absPath.split('/').pop()} (cached=${!!cached})`)
        if (cached && (await jsCacheFresh(cached.inputs))) {
          return new Response(cached.code, {
            headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' },
          })
        }

        const result = await build({
          entryPoints: [absPath],
          bundle: true,
          format: 'esm',
          platform: 'browser',
          jsx: 'automatic',
          jsxImportSource: 'weifuwu/ui-dom',
          alias: JS_ALIASES,
          write: false,
          metafile: true,
        })

        const code = result.outputFiles[0].text

        // 记录所有输入文件及其 mtime，用于缓存失效检测
        const inputs: Record<string, number> = {}
        for (const file of Object.keys(result.metafile?.inputs ?? {})) {
          const abs = resolve(file)
          try {
            inputs[abs] = (await stat(abs)).mtimeMs
          } catch { /* 文件可能已删除 */ }
        }
        // esbuild metafile.inputs 不含入口文件本身（只含 import 依赖）——
        // 入口 mtime 变化不失效 → 服务器进程存活期间入口永不重编译
        // （真实 bug：main.tsx 加数据后用户一直看旧版）。手动加入入口。
        try {
          inputs[absPath] = (await stat(absPath)).mtimeMs
        } catch { /* 入口消失 */ }
        console.log(`[ui:js-cache] 编译: ${absPath.split('/').pop()} (${Object.keys(inputs).length} inputs, ${(code.length / 1024).toFixed(0)}KB)`)
        jsCache.set(absPath, { code, inputs })

        return new Response(code, {
          headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' },
        })
      },

      async css(entryPath: string): Promise<Response> {
        const absPath = resolveEntry(entryPath)

        // 带 mtime 的缓存失效（开发时编辑 CSS 自动更新）
        const st = await import('node:fs').then(fs => fs.promises.stat(absPath))
        const cached = cssCache.get(absPath)
        if (cached && cached.mtime === st.mtimeMs) {
          return new Response(cached.code, {
            headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' },
          })
        }

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

        cssCache.set(absPath, { code, mtime: st.mtimeMs })

        return new Response(code, {
          headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' },
        })
      },
    }

    return next(_req, ctx)
  }
}
