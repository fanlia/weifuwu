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

const esbId = '__weifuwu_tsx_build'

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
    let buf = clientBundleCache.get(key)

    if (!buf) {
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

        buf = result.outputFiles[0].contents
        clientBundleCache.set(key, buf)
      } catch (err) {
        console.error('hydration bundle failed:', err)
        return null
      }
    }

    router.get(url, () => new Response(buf! as BodyInit, {
      headers: { 'content-type': 'application/javascript; charset=utf-8' },
    }))

    const set = clientRouteLog.get(router) ?? new Set()
    set.add(url)
    clientRouteLog.set(router, set)
  }

  return { url }
}

// ── SSR handler ────────────────────────────────────────────────────────────

function makeSsrHandler(
  Component: any,
  loadFn: any | undefined,
  layouts: any[],
  entryPath: string,
  layoutPaths: string[],
  pagesDir: string,
  router: Router,
): Handler {
  return async (req, ctx) => {
    const loadProps = loadFn ? await loadFn({ params: ctx.params, query: ctx.query }) : {}
    const allProps = { ...loadProps, params: ctx.params, query: ctx.query }

    let element = createElement(Component, allProps)
    for (let i = layouts.length - 1; i >= 0; i--) {
      const isRoot = i === 0
      element = createElement(
        layouts[i],
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
  const clientDir = join(pagesDir, '..', '.weifuwu', 'client')

  // 1. Scan
  const pages = scanPages(pagesDir)
  if (pages.length === 0) return new Router()

  // 2. Collect all files to compile
  const allFiles = new Set<string>()
  const loadMap = new Map<string, string>()
  const layoutMap = new Map<string, string[]>()

  for (const p of pages) {
    if (p.entryPath) allFiles.add(p.entryPath)
    if (p.loadPath) {
      allFiles.add(p.loadPath)
      loadMap.set(p.entryPath, p.loadPath)
    }
    for (const lp of p.layouts) allFiles.add(lp)
    layoutMap.set(p.entryPath, [...p.layouts])

    if (p.routePath) allFiles.add(p.routePath)
  }

  // 3. Compile for SSR
  mkdirSync(outDir, { recursive: true })
  await compileAll([...allFiles], outDir, 'node')

  // 4. Import and register routes
  const router = new Router()

  for (const p of pages) {
    if (p.routeOnly && p.routePath) {
      // Standalone route.ts — register all methods including GET
      const rUrl = compiledUrl(p.routePath, outDir)
      const modR = await import(rUrl)
      const methods = (['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const)
      for (const method of methods) {
        if (modR[method]) {
          router.route(method, p.route, modR[method])
        }
      }
      continue
    }

    const url = compiledUrl(p.entryPath, outDir)
    const mod = await import(url)
    const Component = mod.default

    let loadFn: any
    if (p.loadPath) {
      const loadUrl = compiledUrl(p.loadPath, outDir)
      const modLoad = await import(loadUrl)
      loadFn = modLoad.default
    }

    const layoutComponents: any[] = []
    for (const lp of p.layouts) {
      const lUrl = compiledUrl(lp, outDir)
      const modL = await import(lUrl)
      layoutComponents.push(modL.default)
    }

    const handler = makeSsrHandler(
      Component, loadFn, layoutComponents,
      p.entryPath, p.layouts, pagesDir, router,
    )
    router.get(p.route, handler)

    // route.ts alongside page.tsx — skip GET (handled by SSR)
    if (p.routePath) {
      const rUrl = compiledUrl(p.routePath, outDir)
      const modR = await import(rUrl)
      const methods = (['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const)
      for (const method of methods) {
        if (modR[method]) {
          router.route(method, p.route, modR[method])
        }
      }
    }
  }

  return router
}
