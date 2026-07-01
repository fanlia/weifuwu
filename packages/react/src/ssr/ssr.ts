import { createElement } from 'react'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { dirname, join, resolve, relative } from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import { compile, compileVendorBundle } from './compile.ts'
import { streamResponse } from './stream.ts'
import { TsxContext, setCtx, __registerAls, type PageContext } from './tsx-context.ts'
import { Router, isDev as _isDev, type Context, type Handler, type Middleware } from '@weifuwujs/core'
import { ssrEntries } from './ssr-entries.ts'
import { tailwindContext, tailwindRouter } from './tailwind.ts'
import { liveRouter, liveWatcher, liveWs } from './live.ts'
import { moduleServer } from './module-server.ts'
import { layout } from './layout.ts'
import { errorBoundary } from './error-boundary.ts'
import { buildHtmlShell } from './html-shell.ts'
const isDev = _isDev()

const als = new AsyncLocalStorage<PageContext>()
__registerAls(() => als.getStore())

function hashId(s: string): string {
  return createHash('md5').update(s).digest('hex').slice(0, 8)
}

function serializeLoaderData(ctx: Record<string, unknown>): Record<string, unknown> {
  const ld = ctx.loaderData
  return ld && typeof ld === 'object' ? (ld as Record<string, unknown>) : {}
}

// ── Error page ──

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

// ── Route resolution ──

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
      if (s.isDirectory()) {
        dir = literal
        continue
      }
    } catch { /* not found */ }

    let entries: { name: string; isDirectory: () => boolean }[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      routeCache.set(cacheKey, null)
      return null
    }

    const paramDir = entries.find(
      (e) =>
        e.isDirectory() &&
        e.name.startsWith('[') &&
        e.name.endsWith(']') &&
        !e.name.startsWith('[...'),
    )
    if (paramDir) {
      dir = join(dir, paramDir.name)
      continue
    }

    const catchAllDir = entries.find(
      (e) => e.isDirectory() && e.name.startsWith('[...') && e.name.endsWith(']'),
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
  if (!existsSync(pageFile)) {
    routeCache.set(cacheKey, null)
    return null
  }

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
    if (existsSync(nf)) {
      notFoundFile = nf
      break
    }
    if (d === appDir) break
    d = dirname(d)
  }

  const result: ResolvedRoute = {
    routePath: '/' + routeParams.join('/'),
    pageFile,
    layoutFiles,
    errorFiles,
    notFoundFile,
  }
  routeCache.set(cacheKey, result)
  return result
}

// ── Hydration script ──

function buildHydrationScript(pageUrl: string, ctxJson: string): string {
  return `
<script type="module">
import { setCtx, TsxContext } from '@weifuwujs/react';
import { createElement } from 'react';
import { hydrateRoot, createRoot } from 'react-dom/client';

const _ctx = ${ctxJson};
setCtx(_ctx);

const _root = document.getElementById('__weifuwu_root');

async function init() {
  const { default: Page } = await import('${pageUrl}');
  ${
    isDev
      ? `
  window.__WFW_PAGE_URL = '${pageUrl}';

  const _pageImpl = { current: Page };
  const _pageProxy = new Proxy(function __wfw_page(){}, {
    apply(_target, _thisArg, args) {
      return Reflect.apply(_pageImpl.current, _thisArg, args);
    },
  });

  const reactRoot = createRoot(_root);
  let _tick = 0;
  function renderPage() {
    reactRoot.render(createElement(TsxContext.Provider, { value: _ctx },
      createElement(_pageProxy, { __t: _tick })));
  }
  renderPage();

  window.__WFW_RERENDER = () => {
    _tick++;
    reactRoot.render(createElement(TsxContext.Provider, { value: _ctx },
      createElement(_pageProxy, { __t: _tick })));
  };

  window.__WFW_REFRESH = async (NewComponent) => {
    const store = globalThis.__WEIFUWU_CTX_STORE?._ctx || _ctx;
    _pageImpl.current = NewComponent;
    __WFW_RERENDER();
  };
  `
      : `
  const app = createElement(TsxContext.Provider, { value: _ctx },
    createElement(Page));
  hydrateRoot(_root, app);
  `
  }
}

init();
</script>`
}

// ── Page renderer ──

function renderPage(pageFile: string, projectDir: string): Handler {
  const absPath = resolve(pageFile)
  const entryId = hashId(absPath)
  ssrEntries.set(entryId, { path: absPath })

  return async (req, ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pageMod: any
    try {
      pageMod = await compile(absPath)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[ssr] compile failed: ${pageFile} — ${msg}`) // eslint-disable-line no-console
      return errorPage('Compilation failed', `${pageFile}: ${msg}`)
    }

    const Component = pageMod.default
    if (!Component) return errorPage('Missing default export', pageFile)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layouts = (ctx as any).layoutStack || []
    const layoutComponents = layouts.map((l: { component: unknown }) => l.component)

    const base = (ctx.mountPath || '').replace(/\/$/, '')
    const loaderData = serializeLoaderData(ctx as unknown as Record<string, unknown>)

    const ctxValue: PageContext = {
      params: ctx.params,
      query: ctx.query,
      user: (ctx.user ?? {}) as unknown as Record<string, unknown>,
      parsed: ctx.parsed ?? {},
      theme: ctx.theme,
      i18n: ctx.i18n,
      flash: ctx.flash as PageContext['flash'],
      loaderData,
      env: ctx.env ?? {},
    }

    const pageRelative = relative(projectDir, absPath)
    const pageUrl = `${base}/__wfw/m/${pageRelative}`

    return als.run(ctxValue, async () => {
      setCtx(ctxValue)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let element: any = createElement(
        'div',
        { id: '__weifuwu_root' },
        createElement(TsxContext.Provider, { value: ctxValue }, createElement(Component, null)),
      )

      element = buildHtmlShell('weifuwu', element, layoutComponents)

      const { renderToReadableStream } = await import('react-dom/server')
      const stream = await renderToReadableStream(element)
      return streamResponse(
        stream,
        {
          ctx: ctx as Context,
          base,
          isDev,
          loaderData,
          tailwind: (ctx as unknown as Record<string, unknown>).tailwind as
            | { css: string; url: string }
            | undefined,
        },
        buildHydrationScript(pageUrl, JSON.stringify(ctxValue)),
      )
    })
  }
}

// ── Middleware chain runner ──

function runChain(
  mws: Middleware[],
  handler: Handler,
  req: Request,
  ctx: Context,
): Promise<Response> {
  let idx = 0
   
  const dispatch: Handler = (r, c) => {
    if (idx < mws.length) return mws[idx++](r, c, dispatch as Handler<Context>)
    return handler(r, c)
  }
  return Promise.resolve(dispatch(req, ctx))
}

// ── Route discovery ──

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
    try {
      entries = readdirSync(currentDir, { withFileTypes: true })
    } catch {
      return
    }

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

// ── Public API ──

export interface SsrModule extends Router {
  close?: () => void
  pages?: () => RouteEntry[]
}

export function ssr(opts: { dir: string }): SsrModule {
  const r = new Router()
  const dir = resolve(opts.dir)
  const routeCache = new Map<string, ResolvedRoute | null>()

  const wfwRoot = resolve(import.meta.dirname ?? __dirname)
  r.use('/', moduleServer({ root: [dir, wfwRoot] }))

  compileVendorBundle().catch(() => {})

  r.get('/__wfw/v/bundle', async () => {
    const code = await compileVendorBundle()
    return new Response(code, {
      headers: { 'content-type': 'application/javascript; charset=utf-8' },
    })
  })

  if (existsSync(join(dir, 'app', 'globals.css'))) {
    r.use('/', tailwindRouter(dir))
  }

  let devWatcher: { close: () => void } | undefined
  if (isDev) {
    r.use('/', liveRouter(dir))
    r.ws('/__weifuwu/livereload', liveWs())
    devWatcher = liveWatcher(dir)
  }

  r.all('/*', async (req, ctx) => {
    const prefix = ctx.mountPath || ''
    const pathname = new URL(req.url).pathname
    const relativePath = pathname.replace(prefix, '') || '/'
    const segments = relativePath.split('/').filter(Boolean)

    const resolved = await resolveRoute(dir, segments, routeCache)
    if (!resolved) {
      if (isDev) {
        const pages = discoverRoutes(dir)
          .map((p) => p.path)
          .sort()
        return Response.json(
          {
            error: 'Not Found',
            path: '/' + segments.join('/'),
            method: req.method,
            hint: 'Available SSR pages',
            pages,
          },
          { status: 404 },
        )
      }
      return new Response('Not Found', { status: 404 })
    }

    const mws: Middleware[] = [
      ...resolved.errorFiles.map((f) => errorBoundary(f)),
      ...resolved.layoutFiles.map((f) => layout(f)),
      tailwindContext(dir),
    ]

    const handler: Handler = (req, ctx) => renderPage(resolved.pageFile, dir)(req, ctx)
    return runChain(mws, handler, req, ctx)
  })

  const mod = r as SsrModule
  mod.pages = () => discoverRoutes(dir)
  if (devWatcher) mod.close = devWatcher.close.bind(devWatcher)
  return mod
}
