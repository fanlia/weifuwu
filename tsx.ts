import { createElement } from 'react'
import { renderToReadableStream } from 'react-dom/server'
import * as esbuild from 'esbuild'
import { readdirSync, statSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep, dirname, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import chokidar from 'chokidar'
import type { WebSocket } from 'ws'
import { Router } from './router.ts'
import type { Context, Handler } from './types.ts'
import { TsxContext, useTsx } from './tsx-context.ts'

export { TsxContext, useTsx }

export interface TsxOptions {
  dir: string
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

// ── live reload ────────────────────────────────────────────────────────────
const liveReloadClients = new Set<WebSocket>()

function broadcastReload() {
  for (const ws of liveReloadClients) {
    try { ws.send('reload') } catch { liveReloadClients.delete(ws) }
  }
}

const isDev = process.env.NODE_ENV !== 'production'

let _uiDir = ''
let _allFiles: string[] = []
let _outDir = ''
let _router: Router | null = null
let _pagesDir = ''
let _nodeEntries: Record<string, { route: string; entryPath: string; layouts: string[]; loadPath?: string; routePath?: string }> = {}

// ── Tailwind CSS ─────────────────────────────────────────────────────────
let _compiledTailwindCss = ''
let _tailwindPlugin: any = null
let _postcss: any = null

// ── helpers ────────────────────────────────────────────────────────────────

const _cjsRequire = createRequire(import.meta.url)
const _vmCtx = vm.createContext(Object.create(globalThis))

function loadSSRModule(code: string): any {
  const mod = { exports: {} }
  _vmCtx.require = (name: string) => _cjsRequire(name)
  _vmCtx.module = mod
  _vmCtx.exports = mod.exports
  new vm.Script(code).runInContext(_vmCtx)
  return mod.exports
}

function id(s: string): string {
  return createHash('md5').update(s).digest('hex').slice(0, 8)
}

let _alias: Record<string, string> | null = null

function resolveAliases(): Record<string, string> {
  if (_alias) return _alias
  const configFiles = ['tsconfig.json', 'jsconfig.json']
  for (const file of configFiles) {
    const p = resolve(file)
    if (existsSync(p)) {
      try {
        const config = JSON.parse(readFileSync(p, 'utf-8'))
        const paths = config.compilerOptions?.paths
        if (paths) {
          const alias: Record<string, string> = {}
          for (const [key, values] of Object.entries(paths as Record<string, string[]>)) {
            const cleanKey = key.replace('/*', '')
            const val = values[0]?.replace('/*', '')
            if (val) alias[cleanKey] = resolve(dirname(p), val)
          }
          _alias = alias
          return alias
        }
      } catch {}
    }
  }
  _alias = {}
  return {}
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
  alias?: Record<string, string>,
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
    alias,
    allowOverwrite: true,
  })
}

function compiledUrl(filePath: string, outDir: string): string {
  const hash = id(join(outDir, id(filePath)))
  const p = join(outDir, id(filePath) + '.js')
  return pathToFileURL(p).href
}

// ── dev file watcher ──────────────────────────────────────────────────────

function startFileWatcher() {
  let timeout: ReturnType<typeof setTimeout> | null = null
  const pending = new Set<string>()

  chokidar.watch(_uiDir, {
    ignored: /(^|[/\\])\.(?!\.)|node_modules|[/\\]\.weifuwu[/\\]|[/\\]dist[/\\]/,
    persistent: false,
    ignoreInitial: true,
  }).on('all', async (event, filePath) => {
    if (event !== 'change' && event !== 'add') return
    if (!/\.tsx?$/.test(filePath)) return

    pending.add(filePath)

    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(async () => {
      timeout = null
      const files = [...pending]
      pending.clear()
      const exists = files.filter(f => existsSync(f))

      const allKnown = exists.every(f =>
        pageModules.has(f) || layoutModules.has(f) || loadModules.has(f) || routeModules.has(f)
      )

      if (allKnown) {
        for (const f of exists) await recompileAndSwap(f, _outDir)
        _compiledTailwindCss = ''; await compileTailwind(_uiDir)
        broadcastReload()
      } else {
        await recompileAll()
      }
    }, 50)
  })
}

async function recompileAndSwap(filePath: string, outDir: string) {
  try {
    const result = await esbuild.build({
      entryPoints: { [id(filePath)]: filePath },
      outdir: outDir,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      jsxImportSource: 'react',
      bundle: true,
      external: ['react', 'react-dom', 'esbuild', 'graphql', 'ws', 'zod', '@graphql-tools/schema', 'ai'],
      alias: resolveAliases(),
      write: false,
    })

    const code = new TextDecoder().decode(result.outputFiles[0].contents)
    const mod = loadSSRModule(code)

    const name = basename(filePath)
    if (name === 'layout.tsx') {
      layoutModules.set(filePath, mod)
      clientBundleCache.clear()
    } else if (name === 'route.ts') {
      const handlers = new Map<string, Handler>()
      for (const m of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const) {
        if ((mod as any)[m]) handlers.set(m, (mod as any)[m])
      }
      routeModules.set(filePath, handlers)
    } else if (name === 'load.ts') {
      loadModules.set(filePath, mod)
    } else {
      pageModules.set(filePath, mod)
      clientBundleCache.delete(id(filePath))
    }
  } catch (err) {
    console.error('recompile failed:', (err as Error).message)
  }
}

async function recompileAll() {
  try {
    // Re-scan for new files
    const freshPages = scanPages(_pagesDir)
    const freshFiles = new Set<string>()
    const nodeEntries: Record<string, { route: string; entryPath: string; layouts: string[]; loadPath?: string; routePath?: string }> = {}
    for (const p of freshPages) {
      const nodeKey = p.entryPath || p.routePath || ''
      nodeEntries[nodeKey] = { route: p.route, entryPath: p.entryPath, layouts: p.layouts, loadPath: p.loadPath, routePath: p.routePath }
      if (p.entryPath) freshFiles.add(p.entryPath)
      if (p.loadPath) freshFiles.add(p.loadPath)
      for (const lp of p.layouts) freshFiles.add(lp)
      if (p.routePath) freshFiles.add(p.routePath)
    }
    const nfPath = join(_pagesDir, 'not-found.tsx')
    if (existsSync(nfPath)) {
      freshFiles.add(nfPath)
      const rootLayouts = resolveLayouts(_pagesDir, _pagesDir)
      for (const lp of rootLayouts) freshFiles.add(lp)
    }

    _allFiles = [...freshFiles]

    const result = await esbuild.build({
      entryPoints: Object.fromEntries(_allFiles.map(f => [id(f), f])),
      outdir: _outDir,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      jsxImportSource: 'react',
      bundle: true,
      external: ['react', 'react-dom', 'esbuild', 'graphql', 'ws', 'zod', '@graphql-tools/schema', 'ai'],
      alias: resolveAliases(),
      write: false,
    })

    for (const file of result.outputFiles) {
      const code = new TextDecoder().decode(file.contents)
      const mod = loadSSRModule(code)

      const srcPath = _allFiles.find(f => file.path.endsWith(id(f) + '.js'))
      if (!srcPath) continue

      const name = basename(srcPath)
      if (name === 'layout.tsx') {
        layoutModules.set(srcPath, mod)
      } else if (name === 'route.ts') {
        const handlers = new Map<string, Handler>()
        for (const m of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const) {
          if ((mod as any)[m]) handlers.set(m, (mod as any)[m])
        }
        routeModules.set(srcPath, handlers)
      } else if (name === 'load.ts') {
        loadModules.set(srcPath, mod)
      } else if (name !== 'not-found.tsx') {
        pageModules.set(srcPath, mod)
      }
    }

    // Register routes for new entries
    if (_router) {
      const methods = ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const
      for (const [key, entry] of Object.entries(nodeEntries)) {
        if (_nodeEntries[key]) continue

        if (entry.routePath && !entry.entryPath) {
          // Standalone route.ts
          _router.route('GET', entry.route, (req, ctx) =>
            routeModules.get(entry.routePath!)?.get('GET')?.(req, ctx) ?? new Response('', { status: 501 }),
          )
          for (const m of methods) {
            _router.route(m, entry.route, (req, ctx) =>
              routeModules.get(entry.routePath!)?.get(m)?.(req, ctx) ?? new Response('', { status: 501 }),
            )
          }
        }

        if (entry.entryPath) {
          const handler = makeSsrHandler(entry.entryPath, entry.layouts, entry.loadPath, _pagesDir, _router)
          _router.get(entry.route, handler)

          if (entry.routePath) {
            for (const m of methods) {
              _router.route(m, entry.route, (req, ctx) =>
                routeModules.get(entry.routePath!)?.get(m)?.(req, ctx) ?? new Response('', { status: 501 }),
              )
            }
          }
        }

        console.log('ℹ weifuwu/tsx: registered new route ' + entry.route)
      }
      _nodeEntries = nodeEntries
    }

    clientBundleCache.clear()
    _compiledTailwindCss = ''; await compileTailwind(_uiDir)
    broadcastReload()
  } catch (err) {
    console.error('recompile all failed:', (err as Error).message)
  }
}


// ── Tailwind CSS ────────────────────────────────────────────────────────────

async function compileTailwind(uiDir: string): Promise<string> {
  // Only compile once — all app.css files are identical (@import "tailwindcss")
  if (_compiledTailwindCss) return _compiledTailwindCss

  try {
    _tailwindPlugin ??= (await import('@tailwindcss/postcss')).default
    _postcss ??= (await import('postcss')).default
  } catch {
    return ''
  }

  const inputFile = resolve(uiDir, 'app.css')
  if (!existsSync(inputFile)) {
    mkdirSync(uiDir, { recursive: true })
    writeFileSync(inputFile, '@import "tailwindcss"\n', 'utf-8')
    console.log('ℹ weifuwu/tsx: created ' + relative(process.cwd(), inputFile))
  }

  try {
    const src = readFileSync(inputFile, 'utf-8')
    const result = await _postcss([_tailwindPlugin()]).process(src, { from: inputFile })
    _compiledTailwindCss = result.css
  } catch (err) {
    console.warn('Tailwind CSS processing failed:', (err as Error).message)
  }

  return _compiledTailwindCss
}

async function setupTailwind(uiDir: string, router: Router) {
  await compileTailwind(uiDir)

  router.get('/__wfw/style.css', () => new Response(_compiledTailwindCss || '', {
    headers: { 'content-type': 'text/css; charset=utf-8' },
  }))

  if (isDev) {
    const inputFile = resolve(uiDir, 'app.css')
    chokidar.watch(inputFile, { persistent: false }).on('change', async () => {
      _compiledTailwindCss = ''  // Force recompile
      await compileTailwind(uiDir)
      broadcastReload()
    })
  }
}

// ── client bundle (lazy) ───────────────────────────────────────────────────

const clientBundleCache = new Map<string, Uint8Array>()
const clientRouteLog = new WeakMap<object, Set<string>>()
const clientBuildParams = new Map<string, { entryPath: string; layoutPaths: string[]; pagesDir: string }>()

async function buildClientBundle(
  entryPath: string,
  _layoutPaths: string[],
  pagesDir: string,
): Promise<Uint8Array | null> {
  try {
    // Hydration targets __weifuwu_root (inside layout's <body>), creates Page(props)
    // Provider is omitted — Page receives props directly from __WEIFUWU_PROPS
    const code = [
      `import{hydrateRoot}from'react-dom/client';`,
      `import{createElement}from'react';`,
      `import P from${JSON.stringify(entryPath)};`,
      `const p=window.__WEIFUWU_PROPS;`,
      `let el=createElement(P,p);`,
      `hydrateRoot(document.getElementById('__weifuwu_root'),el);`,
    ].join('')

    const result = await esbuild.build({
      stdin: { contents: code, loader: 'tsx', resolveDir: pagesDir },
      bundle: true,
      format: 'esm',
      jsx: 'automatic',
      jsxImportSource: 'react',
      alias: resolveAliases(),
      write: false,
      minify: true,
    })

    return result.outputFiles[0].contents
  } catch (err) {
    console.error('hydration bundle failed:', err)
    return null
  }
}

async function getOrBuildClientBundle(
  entryPath: string,
  layoutPaths: string[],
  pagesDir: string,
  router: Router,
): Promise<{ url: string } | null> {
  const key = id(entryPath)
  const url = `/__wfw/client/${key}.js`

  clientBuildParams.set(key, { entryPath, layoutPaths, pagesDir })

  if (!clientRouteLog.get(router)?.has(url)) {
    if (!clientBundleCache.has(key)) {
      const buf = await buildClientBundle(entryPath, layoutPaths, pagesDir)
      if (!buf) return null
      clientBundleCache.set(key, buf)
    }

    router.get(url, async () => {
      let buf = clientBundleCache.get(key)
      if (!buf) {
        const params = clientBuildParams.get(key)
        if (params) {
          const rebuilt = await buildClientBundle(params.entryPath, params.layoutPaths, params.pagesDir)
          if (rebuilt) {
            clientBundleCache.set(key, rebuilt)
            buf = rebuilt
          }
        }
      }
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
    const base = (ctx.mountPath || '').replace(/\/$/, '')
    const pageMod = pageModules.get(entryPath)
    if (!pageMod) return new Response('', { status: 500 })
    const Component = pageMod.default

    const loadMod = loadPath ? loadModules.get(loadPath) : undefined
    const loadFn = loadMod?.default
    const loadProps = loadFn ? await loadFn({ params: ctx.params, query: ctx.query }) : {}
    const allProps = { ...loadProps, params: ctx.params, query: ctx.query }

    // Provider wraps Page (for useTsx), then layouts wrap Provider+Page
    let element: any = createElement(TsxContext.Provider as any, {
      value: { params: ctx.params, query: ctx.query, user: ctx.user, parsed: ctx.parsed },
    }, createElement(Component, allProps))

    // Layouts wrap Provider+Page. Root layout must render <body><div id="__weifuwu_root">{children}</div></body>
    if (layoutPaths.length === 0) {
      // Default layout when project has no layout.tsx
      element = createElement('html', { lang: 'en' },
        createElement('head', null,
          createElement('meta', { charSet: 'utf-8' }),
          createElement('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
          createElement('title', null, 'weifuwu'),
        ),
        createElement('body', null, createElement('div', { id: '__weifuwu_root' }, element)),
      )
    } else {
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
    }

    const stream = await renderToReadableStream(element)
    const body = await readStream(stream)

    const scripts: string[] = []
    scripts.push(`<script>window.__WEIFUWU_PROPS=${JSON.stringify(allProps)}</script>`)

    const bundle = await getOrBuildClientBundle(entryPath, layoutPaths, pagesDir, router)
    if (bundle) {
      scripts.push(`<script type="module" src="${base}${bundle.url}"></script>`)
    }

    let html = body.startsWith('<!DOCTYPE html>') ? body : `<!DOCTYPE html>\n${body}`
    html += '\n' + scripts.join('\n')

    if (_compiledTailwindCss && html.includes('</head>')) {
      html = html.replace('</head>',
        `<link rel="stylesheet" href="${base}/__wfw/style.css" />\n</head>`)
    }

    if (isDev) {
      html += `\n<script>(function(){var ws=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'${base}/__weifuwu/livereload');ws.onmessage=function(e){if(e.data==='reload')location.reload()};ws.onclose=function(){setTimeout(function(){location.reload()},500)}})()<\/script>`
    }

    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
}

// ── main export ────────────────────────────────────────────────────────────

export async function tsx(options: TsxOptions): Promise<Router> {
  const uiDir = resolve(options.dir)
  const pagesDir = existsSync(join(uiDir, 'pages')) ? join(uiDir, 'pages') : uiDir
  _uiDir = uiDir
  _pagesDir = pagesDir
  const outDir = join(uiDir, '.weifuwu', 'ssr')
  _outDir = outDir

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
  _allFiles = [...allFiles]
  await compileAll(_allFiles, outDir, 'node', resolveAliases())

  // 4. Load modules into registry and register routes
  const router = new Router()
  _router = router
  const methods = ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const

  for (const p of pages) {
    const nodeKey = p.entryPath || p.routePath || ''
    _nodeEntries[nodeKey] = { route: p.route, entryPath: p.entryPath || '', layouts: p.layouts, loadPath: p.loadPath, routePath: p.routePath }

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
      const base = (ctx.mountPath || '').replace(/\/$/, '')
      const nfMod = pageModules.get(nfPath)
      if (!nfMod) return new Response('Not Found', { status: 404 })
      const NfComponent = nfMod.default

      let element: any = createElement(TsxContext.Provider, {
        value: { params: ctx.params, query: ctx.query, user: ctx.user, parsed: ctx.parsed },
      }, createElement(NfComponent, { params: ctx.params, query: ctx.query }))

      for (let i = rootLayouts.length - 1; i >= 0; i--) {
        const LMod = layoutModules.get(rootLayouts[i])
        if (!LMod) continue
        element = createElement(LMod.default, { children: element })
      }

      const stream = await renderToReadableStream(element)
      const body = await readStream(stream)
      let html = body.startsWith('<!DOCTYPE html>') ? body : `<!DOCTYPE html>\n${body}`
      if (_compiledTailwindCss && html.includes('</head>')) {
        html = html.replace('</head>',
          `<link rel="stylesheet" href="${base}/__wfw/style.css" />\n</head>`)
      }
      if (isDev) {
        html += `\n<script>(function(){var ws=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'${base}/__weifuwu/livereload');ws.onmessage=function(e){if(e.data==='reload')location.reload()};ws.onclose=function(){setTimeout(function(){location.reload()},500)}})()<\/script>`
      }
      return new Response(html, {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }

    router.all('/*', handler)
  }

  await setupTailwind(uiDir, router)

  if (isDev) {
    router.ws('/__weifuwu/livereload', {
      open(ws) {
        liveReloadClients.add(ws)
        ws.on('close', () => liveReloadClients.delete(ws))
        ws.on('error', () => liveReloadClients.delete(ws))
      },
    })
    startFileWatcher()
  }

  return router
}
