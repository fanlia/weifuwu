/**
 * ui 中间件 — 注入 ctx.ui.html / ctx.ui.js / ctx.ui.css
 *
 * ctx.ui.html  是 tagged template，返回完整 HTML Response。
 * ctx.ui.js    编译 TSX 入口，返回 JS bundle Response。
 * ctx.ui.css   读取 CSS 文件（@import 闭包进新鲜度键 —— 无外部编译依赖），返回 CSS Response。
 *
 * ```ts
 * import { ui } from '../../index.ts'
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
import { createHash } from 'node:crypto'
import { resolve, dirname, basename, join, sep } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { bundleLayout, isLayoutSourceDir } from '../../../level5/client/layout/bundle.ts' // CSS 装配单源（LAYOUT-PLAN W1）
import type { Middleware, Context } from '../../../level0/types.ts'
import { HtmlSafe } from '../../../level5/server/ui/html-safe.ts'
import { v2ToHtml } from '../../../level3/vdom/v2/integrate.ts' // v1 退役——运行路径 v2 化（v1 renderToStream 仅对账基线）
import { commandToHtml } from '../../../level3/vdom/ssr/html.ts'
import { h } from '../../client/vdom/index.ts'
import type { Component } from '../../client/vdom/index.ts'

// 浏览器端编译：**零 alias（2027-03 定稿）**——import 'weifuwu/client/vdom' 由
// 包根定位 + dist 目录约定解析（exports 字段已删——dist 树即导出面：
// dist/server/ + dist/client/vdom/ + dist/client/components/）——
// src 模式（dev）与 dist 模式（发布）均由同一约定映射（就近 package.json = 包根）——
// 无手写副本（历史层级错位类 bug 根治：JS_ALIASES 删除）

declare module '../../../level0/types.ts' {
  interface Context {
    ui: {
      /** Tagged template → HTML Response */
      html: UiHtmlTag
      /** 编译 TSX → JS bundle Response（支持包名 weifuwu/ui-dom 或文件路径） */
      js: (entryPath: string) => Promise<Response>
      /** 读取 CSS → CSS Response（支持包名 weifuwu/client/layout、weifuwu/client/components/style.css 或文件路径） */
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

// ── JS/CSS 编译缓存（S4——SERVER-PERF-PLAN 波次 2） ────────────────────
//
// 修订 a29efec3（2026-12「无缓存」决策）——两条否决理由逐条消除：
//   ① mtime 同 ms 写文件不失效 → 新鲜度键含 size（mtimeMs+size 双维度）；
//      且 js 校验 esbuild metafile 依赖闭包全量（入口未变但依赖变也重建）
//   ② 无锁并发双编译竞态 → in-flight promise map（dedup 而非锁）
// 浏览器面：ETag + Cache-Control: no-cache（可存但每次复验——304 省 900KB 级重传，
// 区别于旧 no-store 零缓存）。

export interface UiOptions {
  /**
   * 编译产物缓存。默认 true。
   * false = 每请求重新编译（旧行为等价——永远新鲜，a29efec3 语义保留逃生舱）。
   */
  cache?: boolean
}

/** 新鲜度校验的输入文件快照（mtimeMs+size 双维度——同 ms 写文件也会因 size 变化失效） */
interface InputStat {
  mtimeMs: number
  size: number
}

interface CompileResult {
  code: string
  etag: string
  /** 依赖闭包快照（新鲜度校验用——js=metafile 全量，css=文件自身） */
  inputs: Record<string, InputStat>
}

/** 缓存容量上限（FIFO 驱逐——防多入口应用膨胀；单应用实际入口数远小于此） */
const MAX_CACHE_ENTRIES = 32

/** 批量 stat → 新鲜度快照（失败标哨兵值——方向安全：必然不新鲜 → 重编） */
async function statAll(paths: string[]): Promise<Record<string, InputStat>> {
  const out: Record<string, InputStat> = {}
  for (const p of paths) {
    try {
      const st = await stat(p)
      out[p] = { mtimeMs: st.mtimeMs, size: st.size }
    } catch {
      out[p] = { mtimeMs: -1, size: -1 }
    }
  }
  return out
}

/**
 * CSS `@import` 相对闭包（递归 + visited 防环）——新鲜度键必须含依赖：
 * 旧实现只 stat 入口文件 → 改 `_tokens.css` 不失效（陈旧缓存）——与 js 面
 * esbuild metafile 全量校验同构。只解析 `./x.css` 相对形态（包名/url() 原样保留）。
 */
async function importClosure(absPath: string, seen: Set<string> = new Set()): Promise<string[]> {
  if (seen.has(absPath)) return []
  seen.add(absPath)
  let css: string
  try {
    css = await readFile(absPath, 'utf-8')
  } catch {
    return []
  }
  const dir = dirname(absPath)
  const out: string[] = []
  for (const m of css.matchAll(/@import\s+['"](\.[^'"]+\.css)['"]/g)) {
    const dep = resolve(dir, m[1])
    out.push(dep, ...(await importClosure(dep, seen)))
  }
  return out
}

/** 包根定位：从本文件向上找最近 package.json（src 模式 = 仓库根；dist 模式 = 安装包根） */
function packageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) throw new Error('[ui] 包根定位失败（向上未找到 package.json）')
    dir = parent
  }
}

/**
 * weifuwu/* 裸识别 → dist levelN 约定（exports 已删——dist 树即导出面）：
 *   weifuwu               → dist/level6/index.js
 *   weifuwu/client/vdom   → dist/level6/client/vdom/index.js
 *   weifuwu/server/ai     → dist/level6/server/ai/index.js
 *   weifuwu/shared/router → dist/level0/router/index.js
 */
const BARE_LEVEL: Record<string, string> = {
  'weifuwu': 'level6/index.js',
  'weifuwu/client/vdom': 'level6/client/vdom/index.js',
  'weifuwu/client/vdom/jsx-runtime': 'level6/client/vdom/jsx-runtime.js',
  'weifuwu/client/vdom/testing': 'level6/client/vdom/testing.js',
  'weifuwu/client/components': 'level6/client/components/index.js',
  'weifuwu/client/layout': 'level6/client/layout/index.js',
  'weifuwu/dev': 'level6/dev/index.js',
  'weifuwu/shared/router': 'level0/router/index.js',
}

function resolveBare(spec: string): string {
  const dist = join(packageRoot(), 'dist')
  const mapped = BARE_LEVEL[spec]
  if (mapped) return join(dist, mapped)
  if (spec.startsWith('weifuwu/server/')) {
    return join(dist, 'level6', 'server', spec.slice('weifuwu/server/'.length), 'index.js')
  }
  if (spec.startsWith('weifuwu/')) {
    const sub = spec.slice('weifuwu/'.length)
    for (const cand of [
      join(dist, sub), `${join(dist, sub)}.js`, `${join(dist, sub)}.css`,
      join(dist, sub, 'index.js'), join(dist, 'level6', sub, 'index.js'), join(dist, 'level5', sub, 'index.js'),
    ]) {
      if (existsSync(cand)) return cand
    }
    return join(dist, sub, 'index.js') // 不存在：返回约定路径（下游报清晰 ENOENT）
  }
  return spec
}

/** JSX runtime 基路径（单实例）：dev（entry 在包 src 内）= src 框架原版；dist/外部 = dist 树同源 */
function jsxBaseFor(entryAbs: string): string {
  const pkg = packageRoot()
  const inSrc = entryAbs.startsWith(join(pkg, 'src') + sep)
  return inSrc ? join(pkg, 'src', 'level6', 'client', 'vdom') : join(pkg, 'dist', 'level6', 'client', 'vdom')
}

/** 解析入口路径：包名（weifuwu/client/layout）→ dist 约定，相对/绝对路径 → path.resolve */
function resolveEntry(entryPath: string): string {
  // 相对/绝对路径：相对于 CWD 解析（不走包内文件位置）
  if (entryPath.startsWith('.') || entryPath.startsWith('/')) {
    return resolve(entryPath)
  }
  // 包名：weifuwu/* 走 dist 约定；其余走 Node 解析
  if (entryPath === 'weifuwu' || entryPath.startsWith('weifuwu/')) {
    return resolveBare(entryPath)
  }
  try {
    return fileURLToPath(import.meta.resolve(entryPath))
  } catch {
    return resolve(entryPath)
  }
}


// ── 中间件 ────────────────────────────────────────────────

export function ui(options: UiOptions = {}): Middleware {
  const cacheEnabled = options.cache !== false

  // 每 ui() 实例独立（应用 = 单实例——行为等同模块级缓存；测试实例隔离）
  const compileCache = new Map<string, CompileResult>()
  const inFlight = new Map<string, Promise<CompileResult>>()
  const stats = { builds: 0, hits: 0, dedups: 0 }

  /** 输入闭包新鲜度：任一文件 mtime/size 变化（或消失）→ 不新鲜（方向安全——宁可重编） */
  async function inputsFresh(inputs: Record<string, InputStat>): Promise<boolean> {
    for (const [file, s] of Object.entries(inputs)) {
      try {
        const st = await stat(file)
        if (st.mtimeMs !== s.mtimeMs || st.size !== s.size) return false
      } catch {
        return false
      }
    }
    return true
  }

  /**
   * 编译（带缓存 + in-flight dedup）。build() 返回产物 + 依赖闭包快照
   * （js = esbuild metafile 全量；css = 文件自身）。
   */
  async function compile(
    kind: 'js' | 'css',
    absPath: string,
    buildFn: () => Promise<{ code: string; inputs: Record<string, InputStat> }>,
  ): Promise<CompileResult> {
    const key = `${kind}:${absPath}`
    if (cacheEnabled) {
      const hit = compileCache.get(key)
      if (hit && (await inputsFresh(hit.inputs))) {
        stats.hits++
        return hit
      }
      const pending = inFlight.get(key)
      if (pending) {
        stats.dedups++
        return pending
      }
    }
    stats.builds++
    const p = (async (): Promise<CompileResult> => {
      const { code, inputs } = await buildFn()
      const etag = `"${createHash('sha1').update(code).digest('hex').slice(0, 20)}"`
      const entry: CompileResult = { code, etag, inputs }
      if (cacheEnabled) {
        if (compileCache.size >= MAX_CACHE_ENTRIES) {
          const oldest = compileCache.keys().next().value
          if (oldest !== undefined) compileCache.delete(oldest)
        }
        compileCache.set(key, entry)
      }
      return entry
    })()
    if (cacheEnabled) {
      inFlight.set(key, p)
      p.catch(() => {}).finally(() => inFlight.delete(key))
    }
    return p
  }

  function respond(req: Request, code: string, etag: string, contentType: string): Response {
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      ETag: etag,
      'Cache-Control': 'no-cache', // 可存但每次复验——内容变则变（新鲜度键保证）
    }
    if (req.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers })
    }
    return new Response(code, { headers })
  }

  const mw = (async (_req, ctx, next) => {
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
        const { code, etag } = await compile('js', absPath, async () => {
          const result = await build({
            entryPoints: [absPath],
            bundle: true,
            format: 'esm',
            platform: 'browser',
            jsx: 'automatic',
            jsxImportSource: jsxBaseFor(absPath),
            write: false,
            metafile: true, // 依赖闭包快照（新鲜度校验——依赖变更也重建）
            logLevel: 'silent',
            plugins: [{
              name: 'weifuwu-dist-fallback',
              setup(b: { onResolve: (o: { filter: RegExp }, cb: (a: { path: string; resolveDir: string }) => { path: string } | undefined) => void }) {
                // 无 tsconfig（paths 不可用）时回退 dist 约定；有 tsconfig → 让默认解析走 paths
                // （dev = src 单实例——防 src/dist 双 vdom 实例混用）
                b.onResolve({ filter: /^weifuwu(\/|$)/ }, (args) => {
                  let dir = args.resolveDir
                  for (;;) {
                    if (existsSync(join(dir, 'tsconfig.json'))) return undefined
                    const parent = dirname(dir)
                    if (parent === dir) break
                    dir = parent
                  }
                  return { path: resolveBare(args.path) }
                })
              },
            }],
          })
          const inputs: Record<string, InputStat> = {}
          for (const key of Object.keys(result.metafile?.inputs ?? {})) {
            const abs = resolve(key)
            try {
              const st = await stat(abs)
              inputs[abs] = { mtimeMs: st.mtimeMs, size: st.size }
            } catch {
              // 记录失败的输入标记哨兵值——后续校验必然不新鲜（方向安全：重编）
              inputs[abs] = { mtimeMs: -1, size: -1 }
            }
          }
          return { code: result.outputFiles[0].text, inputs }
        })
        return respond(_req, code, etag, 'application/javascript')
      },

      async css(entryPath: string): Promise<Response> {
        const absPath = resolveEntry(entryPath)
        const { code, etag } = await compile('css', absPath, async () => {
          const dir = dirname(absPath)
          // **layout 源面 → 装配单源**（LAYOUT-PLAN W1）：入口是 src/level5/client/layout/
          // weifuwu-layout.css 时走 bundle.ts（与 build.mjs / dev server 同一实现——
          // 层序语义一致 + inputs 含全部分量文件）。旧路径：直读入口 → 外部工具
          // 顺带内联 @import → 产物**零 @layer**（覆盖语义 ≠ 发布产物）。
          // dist 入口无分量兄弟文件 → isLayoutSourceDir false → 走下方直读路径。
          if (basename(absPath) === 'weifuwu-layout.css' && (await isLayoutSourceDir(dir))) {
            const bundle = await bundleLayout(dir)
            return { code: bundle.css, inputs: await statAll(bundle.inputs) }
          }
          let code = await readFile(absPath, 'utf-8')
          // 新鲜度键 = 入口 + @import 闭包（依赖变更也重建——旧只 stat 入口 = 陈旧缓存）
          const inputs = await statAll([absPath, ...(await importClosure(absPath))])
          return { code, inputs }
        })
        return respond(_req, code, etag, 'text/css; charset=utf-8')
      },
    }

    return next(_req, ctx)
  }) as Middleware

  // dev/test 观测钩子（编译缓存命中画像——契约测试断言面）
  ;(mw as unknown as { __stats: typeof stats }).__stats = stats

  return mw
}
