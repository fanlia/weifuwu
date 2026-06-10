import { createElement } from 'react'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
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
  if (_bundleDirty) {
    bundleCache.clear()
    _bundleDirty = false
  }
  return bundleCache.get(key)
}

function setBundle(key: string, buf: Uint8Array) {
  if (_bundleDirty) {
    bundleCache.clear()
    _bundleDirty = false
  }
  bundleCache.set(key, buf)
}

function id(s: string): string {
  return createHash('md5').update(s).digest('hex').slice(0, 8)
}

function serializeLoaderData(ctx: any): Record<string, unknown> {
  const ld = (ctx as any).loaderData
  return ld && typeof ld === 'object' ? ld : {}
}

async function buildClientBundle(
  entryPath: string,
  layoutPaths: string[],
): Promise<Uint8Array | null> {
  try {
    const absEntry = resolve(entryPath)
    const absLayouts = layoutPaths.map(p => resolve(p))
    const layoutImports = absLayouts.map(p => `import${JSON.stringify(p)};`).join('')
    const _sc = `(function(){var k='__WEIFUWU_CTX_STORE';var s=typeof globalThis!='undefined'&&globalThis[k];if(!s)return function(){};return function(v){s._ctx={...s._ctx,...v};s._snapshot={params:s._ctx.params,query:s._ctx.query,user:s._ctx.user,parsed:s._ctx.parsed,prefs:s._ctx.prefs,env:s._ctx.env};s._listeners.forEach(function(fn){fn()})}})()`
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
      isDev ? `window.__WFW_ENTRY=${JSON.stringify(id(absEntry))};window.__WFW_REFRESH=function(n){_W._fn=n;window.__WFW_ROOT.render(createElement(App))};` : '',
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

// ---------------------------------------------------------------------------
// Internal: resolve URL segments against the directory convention (sync)
// ---------------------------------------------------------------------------
interface ResolvedRoute {
  routePath: string
  pageFile: string
  layoutFiles: string[]
  errorFiles: string[]
  notFoundFile: string | null
}

function resolveFileSync(ssrDir: string, segments: string[]): ResolvedRoute | null {
  const appDir = join(ssrDir, 'app')
  let dir = appDir
  const paramNames: string[] = []
  const paramValues: string[] = []
  let catchAll: string | null = null
  let segIdx = 0

  for (; segIdx < segments.length; segIdx++) {
    const seg = segments[segIdx]
    const literal = join(dir, seg)
    if (existsSync(literal) && statSync(literal).isDirectory()) {
      dir = literal
      continue
    }

    const entries = readdirSync(dir, { withFileTypes: true })
    const paramDir = entries.find(e =>
      e.isDirectory() && e.name.startsWith('[') && e.name.endsWith(']') && !e.name.startsWith('[...'),
    )
    if (paramDir) {
      paramNames.push(paramDir.name.slice(1, -1))
      paramValues.push(seg)
      dir = join(dir, paramDir.name)
      continue
    }

    const catchAllDir = entries.find(e =>
      e.isDirectory() && e.name.startsWith('[...') && e.name.endsWith(']'),
    )
    if (catchAllDir) {
      catchAll = segments.slice(segIdx).join('/')
      dir = join(dir, catchAllDir.name)
      break
    }

    return null
  }

  const pageFile = join(dir, 'page.tsx')
  if (!existsSync(pageFile)) return null

  // Build routePath for ctx.params matching
  let pi = 0
  const consumed = catchAll !== null ? segIdx : segments.length
  const routeParams: string[] = []
  for (let i = 0; i < consumed; i++) {
    routeParams.push(segments[i])
  }

  // Collect layouts from page dir up to appDir
  const layoutFiles: string[] = []
  let d = dir
  while (d.startsWith(appDir)) {
    const lf = join(d, 'layout.tsx')
    if (existsSync(lf)) layoutFiles.unshift(lf)
    if (d === appDir) break
    d = dirname(d)
  }

  // Collect errors (nearest → farthest)
  const errorFiles: string[] = []
  d = dir
  while (d.startsWith(appDir)) {
    const ef = join(d, 'error.tsx')
    if (existsSync(ef)) errorFiles.unshift(ef)
    if (d === appDir) break
    d = dirname(d)
  }

  // Nearest not-found.tsx walking up
  let notFoundFile: string | null = null
  d = dir
  while (d.startsWith(appDir)) {
    const nf = join(d, 'not-found.tsx')
    if (existsSync(nf)) { notFoundFile = nf; break }
    if (d === appDir) break
    d = dirname(d)
  }

  return { routePath: '/' + routeParams.join('/'), pageFile, layoutFiles, errorFiles, notFoundFile }
}

// ---------------------------------------------------------------------------
// Internal: SSR handler for a single page
// ---------------------------------------------------------------------------
function renderPage(pageFile: string): Handler {
  const absPath = resolve(pageFile)
  const entryId = id(absPath)
  ssrEntries.set(entryId, { path: absPath })
  const bundleKey = `/__ssr/${entryId}.js`

  return async (req, ctx) => {
    const pageMod = await compile(absPath)
    const Component = pageMod.default
    if (!Component) return new Response('', { status: 500 })

    const layouts = (ctx.layoutStack || [])
    const layoutComponents = layouts.map((l: any) => l.component)
    const layoutPaths = layouts.map((l: any) => l.path)

    const base = (ctx.mountPath || '').replace(/\/$/, '')
    const loaderData = serializeLoaderData(ctx)

    const ctxValue: PageContext = {
      params: ctx.params,
      query: ctx.query,
      user: (ctx.user ?? {}) as { id?: string },
      parsed: ctx.parsed ?? {},
      prefs: ctx.prefs ?? {},
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

// ---------------------------------------------------------------------------
// Internal: run a middleware chain manually
// ---------------------------------------------------------------------------
function runChain(mws: Middleware[], handler: Handler, req: Request, ctx: Context): Promise<Response> {
  let idx = 0
  const dispatch: Handler = (r, c) => {
    if (idx < mws.length) return mws[idx++](r, c, dispatch as any)
    return handler(r, c)
  }
  return Promise.resolve(dispatch(req, ctx))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function ssr(opts: { dir: string }): Router & { close?: () => void } {
  const r = new Router()
  const dir = resolve(opts.dir)

  // Infrastructure routes — eager (must be registered before _mountRouter)
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

  // Catch-all: lazy page route resolution
  r.all('/*', async (req, ctx) => {
    const prefix = ctx.mountPath || ''
    const pathname = new URL(req.url).pathname
    const relativePath = pathname.replace(prefix, '') || '/'
    const segments = relativePath.split('/').filter(Boolean)

    const resolved = resolveFileSync(dir, segments)
    if (!resolved) return new Response('Not Found', { status: 404 })

    const mws: Middleware[] = [
      ...resolved.errorFiles.map(f => errorBoundary(f)),
      ...resolved.layoutFiles.map(f => layout(f)),
      tailwindContext(dir),
    ]

    const handler: Handler = (req, ctx) => renderPage(resolved.pageFile)(req, ctx)
    return runChain(mws, handler, req, ctx)
  })

  return r as Router & { close?: () => void }
}
