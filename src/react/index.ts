import { createElement, type ReactElement, type ComponentType } from 'react'
import { renderToReadableStream, type ReactDOMServerReadableStream } from 'react-dom/server'
import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve, join, extname, relative } from 'node:path'
import { glob } from 'node:fs/promises'
import { type Middleware, type Context } from '../types.ts'

import { loadTsxComponent, loadTsxModule } from './compile.ts'
import { ServerDataContext } from './context.ts'

// ═══════════════════════════════════════════════════════════════
// HtmlShell
// ═══════════════════════════════════════════════════════════════

function HtmlShell({ children, data, inlineCSS, clientBundlePath }: {
  children: ReactElement
  data?: Record<string, unknown>
  inlineCSS?: string
  clientBundlePath?: string
}): ReactElement {
  const headChildren: ReactElement[] = [
    createElement('meta', { charSet: 'utf-8', key: 'charset' }) as unknown as ReactElement,
    createElement('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1', key: 'viewport' }) as unknown as ReactElement,
  ]

  // Importmap for externalized packages
  headChildren.push(
    createElement('script', {
      type: 'importmap',
      key: 'importmap',
      dangerouslySetInnerHTML: {
        __html: JSON.stringify({
          imports: {
            'react': '/__weifuwu/vendor/react.js',
            'react-dom': '/__weifuwu/vendor/react.js',
            'react-dom/client': '/__weifuwu/vendor/react.js',
            'react/jsx-runtime': '/__weifuwu/vendor/react.js',
            'weifuwu': '/__weifuwu/react',
            'weifuwu/react': '/__weifuwu/react',
            'weifuwu/react/client': '/__weifuwu/react-client',
          },
        }),
      },
    }) as unknown as ReactElement,
  )

  // Inline Tailwind CSS
  if (inlineCSS) {
    headChildren.push(
      createElement('style', {
        key: 'tailwind',
        dangerouslySetInnerHTML: { __html: inlineCSS },
      }) as unknown as ReactElement,
    )
  }

  const bodyChildren: ReactElement[] = [
    createElement('div', { id: 'root', key: 'root' }, children),
  ]

  // Server data for client-side hydration
  if (data && Object.keys(data).length > 0) {
    bodyChildren.push(
      createElement('script', {
        id: '__WEIFUWU_DATA__',
        type: 'application/json',
        key: 'weifuwu-data',
        dangerouslySetInnerHTML: { __html: JSON.stringify(data).replace(/</g, '\\u003c') },
      }) as unknown as ReactElement,
    )
  }

  // Client hydration bundle
  if (clientBundlePath) {
    bodyChildren.push(
      createElement('script', {
        type: 'module',
        src: clientBundlePath,
        key: 'client',
      }) as unknown as ReactElement,
    )
  }

  return createElement('html', { lang: 'en' },
    createElement('head', null, ...headChildren),
    createElement('body', null, ...bodyChildren),
  ) as unknown as ReactElement
}

// ═══════════════════════════════════════════════════════════════
// Render pipeline
// ═══════════════════════════════════════════════════════════════

async function renderComponent(
  Component: ComponentType,
  data: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layouts: ComponentType<any>[] | null,
  inlineCSS?: string,
  clientBundlePath?: string,
): Promise<Response> {
  let element: ReactElement = createElement(Component)

  // layouts outer-first: [RootLayout, BlogLayout] → RootLayout(BlogLayout(page))
  if (layouts && layouts.length > 0) {
    for (let i = layouts.length - 1; i >= 0; i--) {
      element = createElement(layouts[i], { children: element })
    }
  }

  element = createElement(ServerDataContext.Provider, { value: data }, element)

  const page = createElement(HtmlShell, {
    children: element,
    data: Object.keys(data).length > 0 ? data : undefined,
    inlineCSS,
    clientBundlePath,
  })

  const rstream: ReactDOMServerReadableStream = await renderToReadableStream(page, {
    bootstrapModules: [],
  })

  return new Response(rstream as unknown as ReadableStream<Uint8Array>, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

// ═══════════════════════════════════════════════════════════════
// Directory scanning + URL matching
// ═══════════════════════════════════════════════════════════════

interface DirRouteTable {
  pageMap: Map<string, string>
  layoutMap: Map<string, string[]>
  notFound?: string
  paramNames: Map<string, string[]>
}

const dirCache = new Map<string, DirRouteTable>()

function isDynamicSegment(name: string): string | false {
  if (name.startsWith('[...') && name.endsWith(']')) return name.slice(4, -1)
  if (name.startsWith('[') && name.endsWith(']')) return name.slice(1, -1)
  return false
}

function isRouteGroup(name: string): boolean {
  return name.startsWith('(') && name.endsWith(')')
}

async function scanDirForRoutes(absDir: string): Promise<DirRouteTable> {
  const pageMap = new Map<string, string>()
  const layoutMap = new Map<string, string[]>()
  const paramNames = new Map<string, string[]>()
  let notFound: string | undefined

  async function walk(
    currentDir: string,
    urlSegments: string[],
    accumulatedLayouts: string[],
    currentParams: string[],
  ): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => [] as import('node:fs').Dirent[])
    const files = entries.filter(e => e.isFile())
    const dirs = entries.filter(e => e.isDirectory())

    const pageFile = files.find(f => f.name === 'page.tsx' || f.name === 'page.ts')
    const layoutFile = files.find(f => f.name === 'layout.tsx' || f.name === 'layout.ts')
    const notFoundFile = files.find(f => f.name === 'not-found.tsx' || f.name === 'not-found.ts')

    const currentLayouts = [...accumulatedLayouts]
    if (layoutFile) currentLayouts.push(join(currentDir, layoutFile.name))
    if (notFoundFile && !notFound) notFound = join(currentDir, notFoundFile.name)

    if (pageFile) {
      const urlPath = '/' + urlSegments.join('/')
      if (!pageMap.has(urlPath)) {
        pageMap.set(urlPath, join(currentDir, pageFile.name))
        layoutMap.set(urlPath, currentLayouts)
        paramNames.set(urlPath, [...currentParams])
      }
    }

    for (const dir of dirs) {
      const name = dir.name
      if (isRouteGroup(name)) {
        await walk(join(currentDir, name), urlSegments, currentLayouts, currentParams)
        continue
      }
      const dynamicParam = isDynamicSegment(name)
      if (dynamicParam !== false) {
        const seg = name.startsWith('[...') ? '*' : `:${dynamicParam}`
        await walk(join(currentDir, name), [...urlSegments, seg], currentLayouts, [...currentParams, dynamicParam])
        continue
      }
      await walk(join(currentDir, name), [...urlSegments, name], currentLayouts, currentParams)
    }
  }

  await walk(absDir, [], [], [])
  return { pageMap, layoutMap, notFound, paramNames }
}

async function getDirRouteTable(dir: string): Promise<DirRouteTable> {
  const absDir = resolve(dir)
  const cached = dirCache.get(absDir)
  if (cached) return cached
  const table = await scanDirForRoutes(absDir)
  dirCache.set(absDir, table)
  return table
}

function matchUrlToRoute(
  table: DirRouteTable,
  pathname: string,
): { urlPath: string; params: Record<string, string> } | null {
  const normalized = pathname.endsWith('/') && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname || '/'

  if (table.pageMap.has(normalized)) return { urlPath: normalized, params: {} }

  const segments = normalized.split('/').filter(Boolean)

  for (const [urlPath] of table.pageMap) {
    const patternSegments = urlPath.split('/').filter(Boolean)
    const lastSeg = patternSegments[patternSegments.length - 1]
    if (lastSeg !== '*' && patternSegments.length !== segments.length) continue

    const params: Record<string, string> = {}
    let match = true

    for (let i = 0; i < patternSegments.length; i++) {
      const pSeg = patternSegments[i]
      const sSeg = segments[i]

      if (pSeg === '*' && i === patternSegments.length - 1) {
        params[table.paramNames.get(urlPath)?.[i] ?? '*'] = segments.slice(i).join('/')
        break
      }
      if (pSeg.startsWith(':')) {
        if (sSeg === undefined) { match = false; break }
        params[pSeg.slice(1)] = decodeURIComponent(sSeg)
      } else if (pSeg !== sSeg) {
        match = false
        break
      }
    }
    if (match) return { urlPath, params }
  }

  return null
}

// ═══════════════════════════════════════════════════════════════
// Loader resolution
// ═══════════════════════════════════════════════════════════════

type Loader = (ctx: Context) => Promise<Record<string, unknown>>

async function resolveLoader(modulePath: string): Promise<Loader | null> {
  const mod = await loadTsxModule(modulePath)
  return typeof mod.loader === 'function' ? mod.loader as Loader : null
}

async function callLoader(
  loader: Loader | null,
  ctx: Context,
  data: Record<string, unknown>,
  rethrow = true,
): Promise<Record<string, unknown>> {
  if (!loader) return data
  try {
    return { ...data, ...await loader(ctx) }
  } catch (err) {
    if (rethrow) throw err
    return data
  }
}

// ═══════════════════════════════════════════════════════════════
// Layout loading
// ═══════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadLayouts(paths: string[]): Promise<ComponentType<any>[]> {
  const result: ComponentType[] = []
  for (const p of paths) {
    const c = await loadTsxComponent(p)
    result.push(c)
  }
  return result
}

// ═══════════════════════════════════════════════════════════════
// Tailwind compilation
// ═══════════════════════════════════════════════════════════════

const TW_CANDIDATE_RE = /[a-z][\w-]*(?::[a-z][\w-]*)*(?:-\[[^\]]*\])*(?:\/[0-9]+)?/gi
const CLASS_CONTEXT_RE = /(?:class(?:Name)?\s*[=:]\s*["'`]([^"'`]+)["'`]|["'`]([^"'`\n]{2,})["'`])/g

const tailwindCache = new Map<string, { css: string; mtime: number; sourceMtime: number }>()

/** Walk directory and extract Tailwind class candidates from .tsx/.ts files. */
async function extractTailwindCandidates(dir: string): Promise<string[]> {
  const seen = new Set<string>()
  const pattern = resolve(dir, '**/*.{tsx,ts}')
  try {
    for await (const file of glob(pattern)) {
      try {
        const content = await readFile(file, 'utf-8')
        for (const m of content.matchAll(CLASS_CONTEXT_RE)) {
          const str = m[1] ?? m[2]
          if (!str) continue
          for (const c of str.matchAll(TW_CANDIDATE_RE)) {
            seen.add(c[0])
          }
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return [...seen]
}

async function getDirMtime(dir: string): Promise<number> {
  let maxMtime = 0
  try {
    for await (const file of glob(resolve(dir, '**/*.{tsx,ts,css}'))) {
      try {
        const s = await stat(file)
        if (s.mtimeMs > maxMtime) maxMtime = s.mtimeMs
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return maxMtime
}

async function compileTailwind(dir: string): Promise<string | undefined> {
  const globalsPath = join(dir, 'globals.css')
  try {
    const s = await stat(globalsPath).catch(() => null)
    if (!s) return undefined

    const sourceMtime = await getDirMtime(dir)
    const cached = tailwindCache.get(globalsPath)
    if (cached && cached.mtime === s.mtimeMs && cached.sourceMtime === sourceMtime) return cached.css

    const source = await readFile(globalsPath, 'utf-8')
    const { compile } = await import('@tailwindcss/node')
    const result = await compile(source, {
      base: resolve(dir),
      onDependency: () => {},
    })

    const candidates = await extractTailwindCandidates(dir)
    const css = result.build(candidates)

    tailwindCache.set(globalsPath, { css, mtime: s.mtimeMs, sourceMtime })
    return css
  } catch {
    return undefined
  }
}

// ═══════════════════════════════════════════════════════════════
// Client bundle generation
// ═══════════════════════════════════════════════════════════════

interface ClientBundle {
  entry: string
  chunks: Map<string, string>
}

const vendorBundleCache = new Map<string, string>()
const clientCache = new Map<string, { bundle: ClientBundle; mtime: number }>()

async function compileClientBundle(dir: string, table: DirRouteTable): Promise<ClientBundle | undefined> {
  const rootDir = process.cwd()

  const pages = [...table.pageMap.entries()].map(([urlPath, absPath]) => {
    const relPath = './' + relative(rootDir, absPath)
    return `  '${urlPath}': () => import('${relPath}'),`
  }).join('\n')

  const layoutEntry = table.layoutMap.values().next().value?.[0]
  let layoutCode = ''
  let fallbackCode = ''
  let fallbackOpt = ''

  if (layoutEntry) {
    const relPath = './' + relative(rootDir, layoutEntry)
    layoutCode = `import * as _layout from '${relPath}'\nconst Layout = _layout.default || Object.values(_layout).find(v => typeof v === 'function')`
  } else {
    layoutCode = 'const Layout = undefined'
  }
  if (table.notFound) {
    const relPath = './' + relative(rootDir, table.notFound)
    fallbackCode = `const fallback = () => import('${relPath}')`
    fallbackOpt = '  fallback,'
  }

  const generatedCode = [
    `import { createBrowserRouter } from 'weifuwu/react/client'`,
    layoutCode,
    `const routes = {\n${pages}\n}`,
    fallbackCode,
    '',
    'createBrowserRouter({',
    '  layout: Layout,',
    '  routes,',
    fallbackOpt,
    '})',
  ].filter(Boolean).join('\n')

  const layoutPaths = [...table.layoutMap.values()]
  const allFiles = [
    ...table.pageMap.values(),
    ...layoutPaths.flat(),
    table.notFound,
  ].filter(Boolean) as string[]

  let maxMtime = 0
  for (const f of allFiles) {
    try { const s = await stat(f); if (s.mtimeMs > maxMtime) maxMtime = s.mtimeMs } catch { /* ignore */ }
  }

  const cacheKey = dir + ':client'
  const cached = clientCache.get(cacheKey)
  if (cached && cached.mtime === maxMtime) return cached.bundle

  try {
    const esbuild = await import('esbuild')
    const outdir = join(rootDir, 'node_modules', '.weifuwu', 'esbuild-out')

    await esbuild.build({
      stdin: {
        contents: generatedCode,
        loader: 'ts',
        resolveDir: rootDir,
      },
      bundle: true,
      splitting: true,
      outdir,
      format: 'esm',
      platform: 'browser',
      logLevel: 'silent',
      external: ['weifuwu', 'weifuwu/react', 'weifuwu/react/client', 'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    })

    // Read the written files
    const { readdir: rd, readFile: rf } = await import('node:fs/promises')
    const files = await rd(outdir)
    const entryFile = files.find(f => f === 'stdin.js' || f === 'index.js' || f.endsWith('.js'))
    let entry = ''
    const chunks = new Map<string, string>()

    for (const f of files) {
      if (!f.endsWith('.js')) continue
      const content = await rf(join(outdir, f), 'utf-8')
      if (f === entryFile || f === 'stdin.js') {
        entry = content
      } else {
        chunks.set(f, content)
      }
    }

    const bundle: ClientBundle = { entry, chunks }
    clientCache.set(cacheKey, { bundle, mtime: maxMtime })
    return bundle
  } catch {
    return undefined
  }
}

// ═══════════════════════════════════════════════════════════════
// Directory render
// ═══════════════════════════════════════════════════════════════

let lastClientDir: string | undefined

async function resolveDirToPage(
  dir: string,
  reqUrl: URL,
  ctx: Context,
): Promise<Response> {
  const table = await getDirRouteTable(dir)
  const pathname = reqUrl.pathname

  const match = matchUrlToRoute(table, pathname)

  if (!match) {
    if (table.notFound) {
      const nfComponent = await loadTsxComponent(table.notFound)
      const rootLayouts = table.layoutMap.get('/') ?? []
      const layouts = await loadLayouts(rootLayouts)
      const inlineCSS = await compileTailwind(dir)
      lastClientDir = dir
      await compileClientBundle(dir, table)
      return renderComponent(nfComponent, { error: 'Not Found' }, layouts, inlineCSS, '/__weifuwu/client')
    }
    return new Response('Not Found', { status: 404 })
  }

  Object.assign(ctx.params, match.params)

  const pagePath = table.pageMap.get(match.urlPath)!
  const Component = await loadTsxComponent(pagePath)

  const layoutPaths = table.layoutMap.get(match.urlPath) ?? []
  const layouts = await loadLayouts(layoutPaths)

  let data: Record<string, unknown> = {}
  const pageLoader = await resolveLoader(pagePath)
  if (pageLoader) data = await callLoader(pageLoader, ctx, data, false)

  const inlineCSS = await compileTailwind(dir)
  lastClientDir = dir
  await compileClientBundle(dir, table)

  return renderComponent(Component, data, layouts.length > 0 ? layouts : null, inlineCSS, '/__weifuwu/client')
}

// ═══════════════════════════════════════════════════════════════
// react() middleware
// ═══════════════════════════════════════════════════════════════

/**
 * React SSR middleware.
 *
 * Injects `ctx.render(dir)` and serves client bundles at `/__weifuwu/*`.
 *
 * @example
 * ```ts
 * app.use(react())
 * app.get('/*', async (req, ctx) => ctx.render('./ui'))
 * ```
 */
const reactSourceDir = resolve(process.cwd(), 'node_modules', 'weifuwu', 'src', 'react')

export function react(): Middleware {
  return async (req, ctx, next) => {
    const url = new URL(req.url)
    const pathname = url.pathname

    // Serve compiled client bundle entry
    if (pathname === '/__weifuwu/client') {
      const dir = lastClientDir
      if (!dir) return new Response('No client bundle', { status: 404 })
      const table = await getDirRouteTable(dir)
      const bundle = await compileClientBundle(dir, table)
      if (bundle) {
        return new Response(bundle.entry, {
          headers: { 'content-type': 'application/javascript; charset=utf-8' },
        })
      }
      return new Response('Not found', { status: 404 })
    }

    // Serve vendor react bundle — all react deps in one ESM file
    if (pathname === '/__weifuwu/vendor/react.js') {
      try {
        const cached = vendorBundleCache.get('react')
        if (cached) return new Response(cached, { headers: { 'content-type': 'application/javascript; charset=utf-8' } })

        const esbuild = await import('esbuild')
        const src = [
          `import * as React from 'react'`,
          `import * as ReactDOM from 'react-dom'`,
          `import * as ReactDOMClient from 'react-dom/client'`,
          `import * as JSXRuntime from 'react/jsx-runtime'`,
          `export default React`,
          `export const { createElement, useState, useEffect, useCallback, useMemo, useRef, useContext, createContext, Component, Fragment, use } = React`,
          `export const { createPortal, flushSync } = ReactDOM`,
          `export const { createRoot, hydrateRoot } = ReactDOMClient`,
          `export const { jsx, jsxs, jsxDEV } = JSXRuntime`,
        ].join('\n')
        const result = await esbuild.build({
          stdin: { contents: src, loader: 'js', resolveDir: process.cwd() },
          bundle: true,
          format: 'esm',
          platform: 'browser',
          write: false,
          logLevel: 'silent',
          external: [],
        })
        const code = result.outputFiles[0]?.text ?? ''
        if (code) {
          vendorBundleCache.set('react', code)
          return new Response(code, { headers: { 'content-type': 'application/javascript; charset=utf-8' } })
        }
      } catch { /* fallthrough */ }
      return new Response('Not found', { status: 404 })
    }

    // Serve code-split chunks
    if (pathname.startsWith('/__weifuwu/') && pathname !== '/__weifuwu/client' && pathname !== '/__weifuwu/react' && pathname !== '/__weifuwu/react-client' && !pathname.startsWith('/__weifuwu/vendor/')) {
      const chunkName = pathname.slice('/__weifuwu/'.length)
      const dir = lastClientDir
      if (!dir) return new Response('No client bundle', { status: 404 })
      const table = await getDirRouteTable(dir)
      const bundle = await compileClientBundle(dir, table)
      const chunk = bundle?.chunks.get(chunkName)
      if (chunk) {
        return new Response(chunk, {
          headers: { 'content-type': 'application/javascript; charset=utf-8' },
        })
      }
      return new Response('Not found', { status: 404 })
    }

    // Serve weifuwu react modules for importmap
    if (pathname === '/__weifuwu/react') {
      try {
        // Compile a virtual module that only re-exports client-safe APIs
        const esbuild = await import('esbuild')
        const result = await esbuild.build({
          stdin: {
            contents: [
              `export { useServerData } from '${resolve(reactSourceDir, 'hooks.ts')}'`,
              `export { ServerDataContext } from '${resolve(reactSourceDir, 'context.ts')}'`,
              `export { ErrorBoundary } from '${resolve(reactSourceDir, 'error-boundary.ts')}'`,
              `import { createElement } from 'react'; export function Link({href,children,...p}:any){return createElement('a',{href,...p},children)}`,
            ].join('\n'),
            loader: 'ts',
            resolveDir: reactSourceDir,
          },
          bundle: true,
          format: 'esm',
          platform: 'browser',
          write: false,
          logLevel: 'silent',
          external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
        })
        const code = result.outputFiles[0]?.text ?? ''
        return new Response(code, {
          headers: { 'content-type': 'application/javascript; charset=utf-8' },
        })
      } catch {
        return new Response('Not found', { status: 404 })
      }
    }
    if (pathname === '/__weifuwu/react-client') {
      try {
        const modPath = resolve(process.cwd(), 'node_modules', 'weifuwu', 'dist', 'react', 'client.js')
        const content = await readFile(modPath, 'utf-8')
        return new Response(content, {
          headers: { 'content-type': 'application/javascript; charset=utf-8' },
        })
      } catch {
        return new Response('Not found', { status: 404 })
      }
    }

    ctx.render = async (dir: string) => resolveDirToPage(dir, url, ctx)
    return next(req, ctx)
  }
}

// ═══════════════════════════════════════════════════════════════
// Link — client-side navigation component
// ═══════════════════════════════════════════════════════════════

export function Link({ href, children, ...props }: {
  href: string
  children: React.ReactNode
  [key: string]: unknown
}): ReactElement {
  return createElement('a', { href, ...props }, children) as unknown as ReactElement
}

export { ErrorBoundary } from './error-boundary.ts'
export { useServerData } from './hooks.ts'
export { ServerDataContext } from './context.ts'
