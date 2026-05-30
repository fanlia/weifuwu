import { createElement, createContext, useContext } from 'react'
import { renderToReadableStream } from 'react-dom/server'
import * as esbuild from 'esbuild'
import { readdirSync, statSync, existsSync, mkdirSync } from 'node:fs'
import { join, relative, resolve, sep, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { Router } from './router.ts'
import type { Context, Handler } from './types.ts'

export interface TsxOptions {
  dir: string
}

export const TsxContext = createContext<{
  params: Record<string, string>
  query: Record<string, string>
  user?: unknown
  parsed?: Record<string, unknown>
}>({ params: {}, query: {} })

export function useTsx() {
  return useContext(TsxContext)
}

type PageEntry = {
  route: string
  entryPath: string
  loadPath?: string
  layouts: string[]
  routePath?: string
  routeOnly?: boolean
}

// ── module registry (hot-swappable) ────────────────────────────────────────
const pageModules = new Map<string, any>()
const layoutModules = new Map<string, any>()
const loadModules = new Map<string, any>()
const routeModules = new Map<string, Map<string, Handler>>()

// ── helpers ────────────────────────────────────────────────────────────────

function id(s: string): string {
  return createHash('md5').update(s).digest('hex').slice(0, 8)
}

function concatUint8(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((a, c) => a + c.length, 0)
  const out = new Uint8Array(len)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

async function readStream(stream: ReadableStream): Promise<string> {
  const chunks: Uint8Array[] = []
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return new TextDecoder().decode(concatUint8(chunks))
}

// ── file scanning ──────────────────────────────────────────────────────────

function scanPages(dir: string): PageEntry[] {
  const pages: PageEntry[] = []

  function walk(current: string) {
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      return
    }

    const dirs: string[] = []
    for (const name of entries) {
      const full = join(current, name)
      const st = statSync(full)
      if (st.isDirectory()) {
        if (!name.startsWith('.')) dirs.push(full)
      }
    }

    // Check for page.tsx in this directory
    const pagePath = join(current, 'page.tsx')
    const tsPagePath = join(current, 'page.ts')
    let entryPath = ''
    if (existsSync(pagePath)) {
      entryPath = pagePath
    } else if (existsSync(tsPagePath)) {
      entryPath = tsPagePath
    }

    if (entryPath) {
      let relPath = relative(dir, entryPath).replace(sep, '/')
      relPath = relPath.replace(/\/page\.tsx?$/, '')
      relPath = relPath.replace(/^page\.tsx?$/, '')

      const route = filePathToRoute(relPath)
      const layouts = resolveLayouts(current, dir)
      const loadPath = existsSync(join(current, 'load.ts'))
        ? join(current, 'load.ts') : undefined
      const rPath = existsSync(join(current, 'route.ts'))
        ? join(current, 'route.ts') : undefined

      pages.push({
        route, entryPath, loadPath, layouts, routePath: rPath,
      })

    // Standalone route.ts (no page.tsx)
    } else {
      const rPath = join(current, 'route.ts')
      if (existsSync(rPath)) {
        let relPath = relative(dir, rPath).replace(sep, '/')
        relPath = relPath.replace(/\/route\.tsx?$/, '')
        const route = filePathToRoute(relPath)
        pages.push({
          route, entryPath: '', layouts: [], routePath: rPath, routeOnly: true,
        })
      }
    }

    for (const d of dirs) walk(d)
  }

  walk(dir)
  return pages
}

function filePathToRoute(relPath: string): string {
  let route = relPath.replace(/\\/g, '/')
  // Remove page.tsx suffix => already done in scanPages
  // [...rest] → *
  route = route.replace(/\[\.\.\.(\w+)\]/g, '*')
  // [slug] → :slug
  route = route.replace(/\[(\w+)\]/g, ':$1')
  return route.startsWith('/') ? route : '/' + route
}

function resolveLayouts(dir: string, pagesDir: string): string[] {
  const layouts: string[] = []
  let current = dir

  while (current.startsWith(pagesDir)) {
    const p = join(current, 'layout.tsx')
    if (existsSync(p)) {
      layouts.push(p)
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  // Return outermost first
  return layouts.reverse()
}

// ── compilation ────────────────────────────────────────────────────────────

async function compileAll(
  files: string[],
  outDir: string,
  platform: 'node' | 'browser',
): Promise<void> {
  const entryPoints: Record<string, string> = {}
  for (const f of files) {
    entryPoints[id(f)] = f
  }

  const isBrowser = platform === 'browser'
  await esbuild.build({
    entryPoints,
    outdir: outDir,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    jsxImportSource: 'react',
    bundle: true,
    external: isBrowser ? undefined : [
      'react', 'react-dom', 'esbuild',
      'graphql', 'ws', 'zod',
      '@graphql-tools/schema', 'ai',
    ],
    write: true,
    allowOverwrite: true,
  })
}

function compiledUrl(filePath: string, outDir: string): string {
  const hash = id(join(outDir, id(filePath)))
  const p = join(outDir, id(filePath) + '.js')
  return pathToFileURL(p).href
}

// ── client bundle (lazy) ───────────────────────────────────────────────────

const clientBundleCache = new Map<string, Uint8Array>()
const clientRouteLog = new WeakMap<object, Set<string>>()

async function getOrBuildClientBundle(
  entryPath: string,
  layoutPaths: string[],
  pagesDir: string,
  router: Router,
): Promise<{ url: string } | null> {
  const key = id(entryPath)
  const url = `/__wfw/client/${key}.js`

  if (!clientRouteLog.get(router)?.has(url)) {
    if (!clientBundleCache.has(key)) {
      try {
        const nested = layoutPaths.slice(1)
        const layoutsImport = nested.map((p, i) =>
          `import L${i} from${JSON.stringify(p)};`,
        ).join('')
        const layoutsWrap = nested.map((_, i) => {
          const idx = nested.length - 1 - i
          return `el=createElement(L${idx},null,el);`
        }).join('')

        const code = [
          `import{hydrateRoot}from'react-dom/client';`,
          `import{createElement}from'react';`,
          `import P from${JSON.stringify(entryPath)};`,
          layoutsImport,
          `const p=window.__WEIFUWU_PROPS;`,
          `let el=createElement(P,p);`,
          layoutsWrap,
          `hydrateRoot(document.getElementById('__weifuwu_root'),el);`,
        ].join('')

        const result = await esbuild.build({
          stdin: { contents: code, loader: 'tsx', resolveDir: pagesDir },
          bundle: true,
          format: 'esm',
          jsx: 'automatic',
          jsxImportSource: 'react',
          write: false,
          minify: true,
        })

        clientBundleCache.set(key, result.outputFiles[0].contents)
      } catch (err) {
        console.error('hydration bundle failed:', err)
        return null
      }
    }

    router.get(url, () => {
      const buf = clientBundleCache.get(key)
      return buf
        ? new Response(buf as BodyInit, {
            headers: { 'content-type': 'application/javascript; charset=utf-8' },
          })
        : new Response('', { status: 500 })
    })

    const set = clientRouteLog.get(router) ?? new Set()
    set.add(url)
    clientRouteLog.set(router, set)
  }

  return { url }
}

// ── SSR handler ────────────────────────────────────────────────────────────

function makeSsrHandler(
  entryPath: string,
  layoutPaths: string[],
  loadPath: string | undefined,
  pagesDir: string,
  router: Router,
): Handler {
  return async (req, ctx) => {
    const pageMod = pageModules.get(entryPath)
    if (!pageMod) return new Response('', { status: 500 })
    const Component = pageMod.default

    const loadMod = loadPath ? loadModules.get(loadPath) : undefined
    const loadFn = loadMod?.default
    const loadProps = loadFn ? await loadFn({ params: ctx.params, query: ctx.query }) : {}
    const allProps = { ...loadProps, params: ctx.params, query: ctx.query }

    let element: any = createElement(Component, allProps)
    for (let i = layoutPaths.length - 1; i >= 0; i--) {
      const lp = layoutPaths[i]
      const LMod = layoutModules.get(lp)
      if (!LMod) continue
      const Layout = LMod.default
      const isRoot = i === 0
      element = createElement(
        Layout,
        isRoot ? { children: element, req, ctx } : { children: element },
      )
    }

    element = createElement(TsxContext.Provider as any, {
      value: { params: ctx.params, query: ctx.query, user: ctx.user, parsed: ctx.parsed },
    }, element)

    const stream = await renderToReadableStream(element)
    const body = await readStream(stream)

    const scripts: string[] = []
    scripts.push(`<script>window.__WEIFUWU_PROPS=${JSON.stringify(allProps)}</script>`)

    const bundle = await getOrBuildClientBundle(entryPath, layoutPaths, pagesDir, router)
    if (bundle) {
      scripts.push(`<script type="module" src="${bundle.url}"></script>`)
    }

    const html = `<!DOCTYPE html>\n${body}\n${scripts.join('\n')}`

    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
}

// ── main export ────────────────────────────────────────────────────────────

export async function tsx(options: TsxOptions): Promise<Router> {
  const pagesDir = resolve(options.dir)
  const outDir = join(pagesDir, '..', '.weifuwu', 'ssr')

  // 1. Scan
  const pages = scanPages(pagesDir)
  if (pages.length === 0) return new Router()

  // 2. Collect all files to compile
  const allFiles = new Set<string>()

  for (const p of pages) {
    if (p.entryPath) allFiles.add(p.entryPath)
    if (p.loadPath) allFiles.add(p.loadPath)
    for (const lp of p.layouts) allFiles.add(lp)
    if (p.routePath) allFiles.add(p.routePath)
  }

  // Check for not-found.tsx at root
  const nfPath = join(pagesDir, 'not-found.tsx')
  const hasNotFound = existsSync(nfPath)
  if (hasNotFound) {
    allFiles.add(nfPath)
    // Ensure root layouts are compiled for not-found.tsx
    const rootLayouts = resolveLayouts(pagesDir, pagesDir)
    for (const lp of rootLayouts) allFiles.add(lp)
  }

  // 3. Compile for SSR
  mkdirSync(outDir, { recursive: true })
  await compileAll([...allFiles], outDir, 'node')

  // 4. Load modules into registry and register routes
  const router = new Router()
  const methods = ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const

  for (const p of pages) {
    if (p.routeOnly && p.routePath) {
      // Standalone route.ts — proxy through registry
      const rUrl = compiledUrl(p.routePath, outDir)
      const modR = await import(rUrl)
      const handlers = new Map<string, Handler>()
      for (const m of ['GET', ...methods] as const) {
        if (modR[m]) handlers.set(m, modR[m])
      }
      routeModules.set(p.routePath, handlers)

      router.route('GET', p.route, (req, ctx) =>
        routeModules.get(p.routePath!)?.get('GET')?.(req, ctx) ?? new Response('', { status: 501 }),
      )
      for (const m of methods) {
        router.route(m, p.route, (req, ctx) =>
          routeModules.get(p.routePath!)?.get(m)?.(req, ctx) ?? new Response('', { status: 501 }),
        )
      }
      continue
    }

    // Load modules into registry
    const pageUrl = compiledUrl(p.entryPath, outDir)
    pageModules.set(p.entryPath, await import(pageUrl))

    if (p.loadPath) {
      const loadUrl = compiledUrl(p.loadPath, outDir)
      loadModules.set(p.loadPath, await import(loadUrl))
    }

    for (const lp of p.layouts) {
      const lUrl = compiledUrl(lp, outDir)
      layoutModules.set(lp, await import(lUrl))
    }

    // route handlers
    if (p.routePath) {
      const rUrl = compiledUrl(p.routePath, outDir)
      const modR = await import(rUrl)
      const handlers = new Map<string, Handler>()
      for (const m of methods) {
        if (modR[m]) handlers.set(m, modR[m])
      }
      routeModules.set(p.routePath, handlers)
    }

    const handler = makeSsrHandler(p.entryPath, p.layouts, p.loadPath, pagesDir, router)
    router.get(p.route, handler)

    if (p.routePath) {
      for (const m of methods) {
        router.route(m, p.route, (req, ctx) =>
          routeModules.get(p.routePath!)?.get(m)?.(req, ctx) ?? new Response('', { status: 501 }),
        )
      }
    }
  }

  // not-found.tsx — catch-all with 404 status
  if (hasNotFound) {
    const nfUrl = compiledUrl(nfPath, outDir)
    pageModules.set(nfPath, await import(nfUrl))

    const rootLayouts = resolveLayouts(pagesDir, pagesDir)
    for (const lp of rootLayouts) {
      if (!layoutModules.has(lp)) {
        const lUrl = compiledUrl(lp, outDir)
        layoutModules.set(lp, await import(lUrl))
      }
    }

    const handler: Handler = async (req, ctx) => {
      const nfMod = pageModules.get(nfPath)
      if (!nfMod) return new Response('Not Found', { status: 404 })
      const NfComponent = nfMod.default

      let element: any = createElement(NfComponent, { params: ctx.params, query: ctx.query })
      for (let i = rootLayouts.length - 1; i >= 0; i--) {
        const LMod = layoutModules.get(rootLayouts[i])
        if (!LMod) continue
        element = createElement(LMod.default, { children: element })
      }
      element = createElement(TsxContext.Provider, {
        value: { params: ctx.params, query: ctx.query, user: ctx.user, parsed: ctx.parsed },
      }, element)

      const stream = await renderToReadableStream(element)
      const body = await readStream(stream)
      const html = `<!DOCTYPE html>\n${body}`
      return new Response(html, {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }

    router.all('/*', handler)
  }

  return router
}
