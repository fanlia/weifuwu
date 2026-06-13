import { createElement } from 'react'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { dirname, join, resolve, relative } from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import { compile } from './compile.ts'
import { streamResponse } from './stream.ts'
import type { PageContext } from './tsx-context.ts'
import { TsxContext, setCtx, __registerAls } from './tsx-context.ts'
import { Router } from './router.ts'
import { ssrEntries } from './ssr-entries.ts'
import { isDev as _isDev } from './env.ts'
import { tailwindContext, tailwindRouter } from './tailwind.ts'
import { liveRouter, liveWatcher, liveWs } from './live.ts'
import { layout } from './layout.ts'
import { notFound } from './not-found.ts'
import { errorBoundary } from './error-boundary.ts'
import { buildHtmlShell } from './html-shell.ts'
import type { Context, Handler, Middleware } from './types.ts'

const isDev = _isDev()

const als = new AsyncLocalStorage<PageContext>()
__registerAls(() => als.getStore())

const bundleCache = new Map<string, Uint8Array>()
let _bundleDirty = false

export function markClientBundleDirty() {
  _bundleDirty = true
}

function getBundle(key: string): Uint8Array | undefined {
  if (_bundleDirty) { bundleCache.clear(); _bundleDirty = false }
  return bundleCache.get(key)
}

function setBundle(key: string, buf: Uint8Array) {
  if (_bundleDirty) { bundleCache.clear(); _bundleDirty = false }
  bundleCache.set(key, buf)
}

function hashId(s: string): string {
  return createHash('md5').update(s).digest('hex').slice(0, 8)
}

function serializeLoaderData(ctx: any): Record<string, unknown> {
  const ld = (ctx as any).loaderData
  return ld && typeof ld === 'object' ? ld : {}
}

// ── Error page (browser-visible, dev-friendly) ──────────────────────────

function errorPage(title: string, detail: string, stack?: string): Response {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;max-width:900px;margin:40px auto;padding:0 24px;color:#1a1a2e}
  h1{color:#e53e3e;font-size:24px;margin-bottom:8px}
  .info{color:#718096;font-size:14px;margin-bottom:24px}
  pre{background:#1a1a2e;color:#a0ffa0;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
  .trace{color:#e0e0e0}
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<p class="info">${escapeHtml(detail)}</p>
${stack ? `<pre><span class="trace">${escapeHtml(stack)}</span></pre>` : ''}
</body></html>`
  return new Response(html, {
    status: 500,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Route resolution (async, cached per-path) ───────────────────────────

interface ResolvedRoute {
  routePath: string
  pageFile: string
  layoutFiles: string[]
  errorFiles: string[]
  notFoundFile: string | null
}

async function resolveRoute(
  ssrDir: string,
  segments: string[],
  routeCache: Map<string, ResolvedRoute | null>,
): Promise<ResolvedRoute | null> {
  const cacheKey = segments.join('/') || '/'
  // In production, cache permanently. In dev, skip cache (HMR may change files).
  if (!isDev) {
    const cached = routeCache.get(cacheKey)
    if (cached !== undefined) return cached
  }

  const appDir = join(ssrDir, 'app')
  let dir = appDir
  let catchAll: string | null = null
  let segIdx = 0

  for (; segIdx < segments.length; segIdx++) {
    const seg = segments[segIdx]
    const literal = join(dir, seg)
    try {
      const s = await stat(literal)
      if (s.isDirectory()) { dir = literal; continue }
    } catch { /* not found */ }

    let entries: { name: string; isDirectory: () => boolean }[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      routeCache.set(cacheKey, null)
      return null
    }

    const paramDir = entries.find(e =>
      e.isDirectory() && e.name.startsWith('[') && e.name.endsWith(']') && !e.name.startsWith('[...'),
    )
    if (paramDir) { dir = join(dir, paramDir.name); continue }

    const catchAllDir = entries.find(e =>
      e.isDirectory() && e.name.startsWith('[...') && e.name.endsWith(']'),
    )
    if (catchAllDir) {
      catchAll = segments.slice(segIdx).join('/')
      dir = join(dir, catchAllDir.name)
      break
    }

    routeCache.set(cacheKey, null)
    return null
  }

  const pageFile = join(dir, 'page.tsx')
  if (!existsSync(pageFile)) { routeCache.set(cacheKey, null); return null }

  const consumed = catchAll !== null ? segIdx : segments.length
  const routeParams: string[] = []
  for (let i = 0; i < consumed; i++) routeParams.push(segments[i])

  const layoutFiles: string[] = []
  let d = dir
  while (d.startsWith(appDir)) {
    const lf = join(d, 'layout.tsx')
    if (existsSync(lf)) layoutFiles.unshift(lf)
    if (d === appDir) break
    d = dirname(d)
  }

  const errorFiles: string[] = []
  d = dir
  while (d.startsWith(appDir)) {
    const ef = join(d, 'error.tsx')
    if (existsSync(ef)) errorFiles.unshift(ef)
    if (d === appDir) break
    d = dirname(d)
  }

  let notFoundFile: string | null = null
  d = dir
  while (d.startsWith(appDir)) {
    const nf = join(d, 'not-found.tsx')
    if (existsSync(nf)) { notFoundFile = nf; break }
    if (d === appDir) break
    d = dirname(d)
  }

  const result: ResolvedRoute = { routePath: '/' + routeParams.join('/'), pageFile, layoutFiles, errorFiles, notFoundFile }
  routeCache.set(cacheKey, result)
  return result
}

/** Clear route cache (called by HMR watcher in dev mode). */
export function clearRouteCache(cache: Map<string, ResolvedRoute | null>) {
  cache.clear()
}

// ── Hydration bundle builder ────────────────────────────────────────────

async function buildClientBundle(
  entryPath: string,
  layoutPaths: string[],
): Promise<Uint8Array | null> {
  try {
    const absEntry = resolve(entryPath)
    const absLayouts = layoutPaths.map(p => resolve(p))
    const layoutImports = absLayouts.map(p => `import${JSON.stringify(p)};`).join('')
    const _sc = `(function(){var k='__WEIFUWU_CTX_STORE';var s=typeof globalThis!='undefined'&&globalThis[k];if(!s)return function(){};return function(v){s._ctx={...s._ctx,...v};s._snapshot={params:s._ctx.params,query:s._ctx.query,user:s._ctx.user,parsed:s._ctx.parsed,theme:s._ctx.theme,i18n:s._ctx.i18n,flash:s._ctx.flash,env:s._ctx.env};s._listeners.forEach(function(fn){fn()})}})()`
    const code = [
      layoutImports,
      `${isDev ? "import{createRoot}from'react-dom/client';" : "import{hydrateRoot}from'react-dom/client';"}`,
      `import{createElement}from'react';`,
      `import{TsxContext}from'weifuwu/react';`,
      `import P from${JSON.stringify(absEntry)};`,
      `var setCtx=${_sc};`,
      `const c=document.getElementById('__weifuwu_root');`,
      `if(window.__WEIFUWU_PROPS)setCtx({loaderData:window.__WEIFUWU_PROPS});`,
      isDev ? `const _W=function(props){return(_W._fn||P)(props)};_W._fn=P;const _P=function(props){return createElement(_W,props)};` : '',
      isDev ? `window.__WFW_ENTRY=${JSON.stringify(hashId(absEntry))};window.__WFW_REFRESH=function(n){_W._fn=n;window.__WFW_ROOT.render(createElement(App))};` : '',
      `function App(){`,
      `const ctx=window.__WEIFUWU_CTX||{};`,
      `return createElement(TsxContext.Provider,{value:ctx},`,
      isDev ? `createElement(_P,null))` : `createElement(P,null))`,
      `}`,
      isDev ? `window.__WFW_ROOT=createRoot(c);window.__WFW_ROOT.render(createElement(App));` : `hydrateRoot(c,createElement(App));`,
    ].filter(Boolean).join('')

    const { default: esbuild } = await import('esbuild')
    const result = await esbuild.build({
      stdin: { contents: code, loader: 'tsx', resolveDir: dirname(absEntry) },
      bundle: true,
      format: 'esm',
      jsx: 'automatic',
      jsxImportSource: 'react',
      banner: { js: 'self.process={env:{}};' },
      loader: { '.node': 'empty' },
      external: isDev ? ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'weifuwu', 'weifuwu/react'] : undefined,
      write: false,
      minify: !isDev,
    })

    return result.outputFiles[0].contents
  } catch (err) {
    console.error('hydration bundle failed:', err)
    return null
  }
}

// ── Page renderer ───────────────────────────────────────────────────────

function renderPage(pageFile: string): Handler {
  const absPath = resolve(pageFile)
  const entryId = hashId(absPath)
  ssrEntries.set(entryId, { path: absPath })
  const bundleKey = `/__ssr/${entryId}.js`

  return async (req, ctx) => {
    // Compile page
    let pageMod: any
    try {
      pageMod = await compile(absPath)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[ssr] compile failed: ${pageFile} — ${msg}`)
      return errorPage('Compilation failed', `${pageFile}: ${msg}`)
    }

    const Component = pageMod.default
    if (!Component) return errorPage('Missing default export', pageFile)

    const layouts = (ctx.layoutStack || [])
    const layoutComponents = layouts.map((l: any) => l.component)
    const layoutPaths = layouts.map((l: any) => l.path)

    const base = (ctx.mountPath || '').replace(/\/$/, '')
    const loaderData = serializeLoaderData(ctx)

    const ctxValue: any = {
      params: ctx.params,
      query: ctx.query,
      user: (ctx.user ?? {}) as { id?: string },
      parsed: ctx.parsed ?? {},
      theme: ctx.theme,
      i18n: ctx.i18n,
      flash: ctx.flash,
      loaderData,
      env: ctx.env ?? {},
    }

    return als.run(ctxValue, async () => {
      setCtx(ctxValue)
      if (ctxValue.parsed?.__localeData) {
        (globalThis as any).__LOCALE_DATA__ = ctxValue.parsed.__localeData
      }

      let element: any = createElement('div', { id: '__weifuwu_root' },
        createElement(TsxContext.Provider, { value: ctxValue },
          createElement(Component, null),
        ),
      )

      element = buildHtmlShell('weifuwu', element, layoutComponents)

      let bundle: { url: string } | null = null
      if (!getBundle(bundleKey)) {
        const buf = await buildClientBundle(absPath, layoutPaths)
        if (buf) setBundle(bundleKey, buf)
      }
      if (getBundle(bundleKey)) {
        bundle = { url: bundleKey }
      }

      const { renderToReadableStream } = await import('react-dom/server')
      const stream = await renderToReadableStream(element)
      return streamResponse(stream, {
        ctx: ctx as any,
        base,
        isDev,
        bundle,
        loaderData,
        compiledTailwindCss: (ctx as any).compiledTailwindCss,
      })
    })
  }
}

// ── Middleware chain runner ─────────────────────────────────────────────

function runChain(mws: Middleware[], handler: Handler, req: Request, ctx: Context): Promise<Response> {
  let idx = 0
  const dispatch: Handler = (r, c) => {
    if (idx < mws.length) return mws[idx++](r, c, dispatch as any)
    return handler(r, c)
  }
  return Promise.resolve(dispatch(req, ctx))
}

// ── Route discovery (sync, for ssr.routes()) ────────────────────────────

export interface RouteEntry {
  path: string
  file: string
}

function discoverRoutes(dir: string): RouteEntry[] {
  const appDir = join(dir, 'app')
  if (!existsSync(appDir)) return []

  const result: RouteEntry[] = []

  function walk(currentDir: string, routePath: string) {
    let entries
    try { entries = readdirSync(currentDir, { withFileTypes: true }) }
    catch { return }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        let segment = entry.name
        if (entry.name.startsWith('[...') && entry.name.endsWith(']')) {
          segment = '*'
        } else if (entry.name.startsWith('[') && entry.name.endsWith(']')) {
          segment = ':' + entry.name.slice(1, -1)
        }
        walk(join(currentDir, entry.name), routePath + '/' + segment)
      } else if (entry.name === 'page.tsx') {
        result.push({
          path: routePath || '/',
          file: relative(appDir, join(currentDir, entry.name)),
        })
      }
    }
  }

  walk(appDir, '')
  return result
}

// ── Public API ──────────────────────────────────────────────────────────

export function ssr(opts: { dir: string }): Router & { close?: () => void; pages?: () => RouteEntry[] } {
  const r = new Router()
  const dir = resolve(opts.dir)
  const routeCache = new Map<string, ResolvedRoute | null>()

  // Infrastructure routes
  r.get('/__ssr/:path', (req, ctx) => {
    const buf = getBundle('/__ssr/' + ctx.params.path)
    if (!buf) return new Response('', { status: 404 })
    return new Response(buf as BodyInit, {
      headers: { 'content-type': 'application/javascript; charset=utf-8' },
    })
  })

  if (existsSync(join(dir, 'app', 'globals.css'))) {
    r.use('/', tailwindRouter(dir))
  }

  if (isDev) {
    r.use('/', liveRouter(dir))
    r.ws('/__weifuwu/livereload', liveWs())
    const watcher = liveWatcher(dir)
    ;(r as any).close = watcher.close
  }

  // Catch-all: lazy page route resolution (async + cached)
  r.all('/*', async (req, ctx) => {
    const prefix = ctx.mountPath || ''
    const pathname = new URL(req.url).pathname
    const relativePath = pathname.replace(prefix, '') || '/'
    const segments = relativePath.split('/').filter(Boolean)

    const resolved = await resolveRoute(dir, segments, routeCache)
    if (!resolved) {
      return isDev
        ? Response.json({ error: 'Not Found', path: '/' + segments.join('/'), method: req.method }, { status: 404 })
        : new Response('Not Found', { status: 404 })
    }

    const mws: Middleware[] = [
      ...resolved.errorFiles.map(f => errorBoundary(f)),
      ...resolved.layoutFiles.map(f => layout(f)),
      tailwindContext(dir),
    ]

    const handler: Handler = (req, ctx) => renderPage(resolved.pageFile)(req, ctx)
    return runChain(mws, handler, req, ctx)
  })

  const mod = r as Router & { close?: () => void; pages?: () => RouteEntry[] }
  mod.pages = () => discoverRoutes(dir)
  return mod
}
